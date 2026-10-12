"""deploy/backup.sh, run against fake restic/docker/curl/flock (no B2, no Docker)."""

import datetime
import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy" / "backup.sh"
GB = 1024**3

FAKES = {
    "restic": r"""#!/usr/bin/env bash
echo "restic $*" >>"$FAKE_LOG"
case "$1" in
  cat) [ "${FAKE_REPO_EXISTS:-1}" = 1 ] ;;
  stats) echo "{\"total_size\":${FAKE_REPO_BYTES:-1000},\"total_file_count\":3}" ;;
  backup) exit "${FAKE_BACKUP_EXIT:-0}" ;;
  restore)
    while [ $# -gt 0 ]; do [ "$1" = --target ] && target=$2; shift; done
    [ "${FAKE_RESTORE_EMPTY:-0}" = 1 ] && exit 0
    mkdir -p "$target/var/backups/food-buddy" "$target/photos/1"
    printf 'PGDMP fake' >"$target/var/backups/food-buddy/food.dump"
    touch "$target/photos/1/a.jpg" "$target/photos/1/b.jpg"
    ;;
esac
""",
    "docker": r"""#!/usr/bin/env bash
echo "docker $*" >>"$FAKE_LOG"
case "$*" in
  "volume inspect"*) echo "$FAKE_PHOTOS" ;;
  *pg_dump*)
    case "${FAKE_DUMP:-ok}" in
      ok) printf 'PGDMP fake' ;;
      empty) ;;
      fail) exit 1 ;;
    esac
    ;;
  *pg_restore*) [ "$(head -c 5)" = PGDMP ] ;;
esac
""",
    "curl": """#!/usr/bin/env bash
echo "curl ${@: -1}" >>"$FAKE_LOG"
""",
    "flock": """#!/usr/bin/env bash
exit "${FAKE_FLOCK_EXIT:-0}"
""",
}

CREDENTIALS = """RESTIC_REPOSITORY=s3:https://s3.example.com/bucket/restic
RESTIC_PASSWORD=secret
AWS_ACCESS_KEY_ID=key-id
AWS_SECRET_ACCESS_KEY=app-key
HEALTHCHECK_URL=https://hc.example/ping
"""


@pytest.fixture
def run(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in FAKES.items():
        (bin_dir / name).write_text(body)
        (bin_dir / name).chmod(0o755)
    env_file = tmp_path / "backup.env"
    env_file.write_text(CREDENTIALS)
    log = tmp_path / "calls.log"
    log.touch()

    def run_script(*args, credentials=None, **fake_env):
        if credentials is not None:
            env_file.write_text(credentials)
        env = {
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "HOME": str(tmp_path),
            "BACKUP_ENV": str(env_file),
            "COMPOSE_DIR": str(tmp_path),
            "STAGE": str(tmp_path / "stage"),
            "FAKE_LOG": str(log),
            "FAKE_PHOTOS": "/var/lib/docker/volumes/food-buddy_photos/_data",
            "CHECK_WEEKDAY": "0",  # never, unless a test asks for it
            **{k: str(v) for k, v in fake_env.items()},
        }
        result = subprocess.run(
            ["bash", str(SCRIPT), *args], env=env, capture_output=True, text=True, timeout=30
        )
        return result, log.read_text().splitlines()

    return run_script


def test_backup_dumps_db_and_backs_up_dump_and_photos(run, tmp_path):
    result, calls = run()

    assert result.returncode == 0, result.stdout + result.stderr
    assert (tmp_path / "stage" / "food.dump").read_text() == "PGDMP fake"
    backup = next(c for c in calls if c.startswith("restic backup"))
    assert f"{tmp_path}/stage/food.dump" in backup
    assert "/var/lib/docker/volumes/food-buddy_photos/_data" in backup
    assert (
        "restic forget --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune"
        in calls
    )
    assert "restic init" not in calls  # repository already exists
    assert not any(c.startswith("restic check") for c in calls)
    assert calls[0] == "curl https://hc.example/ping/start"
    assert calls[-1] == "curl https://hc.example/ping"


def test_backup_initializes_missing_repository(run):
    result, calls = run(FAKE_REPO_EXISTS=0)
    assert result.returncode == 0, result.stderr
    assert "restic init" in calls
    assert calls.index("restic init") < next(
        i for i, c in enumerate(calls) if c.startswith("restic backup")
    )


def test_backup_refuses_to_upload_over_size_cap(run):
    result, calls = run(FAKE_REPO_BYTES=8 * GB)
    assert result.returncode == 1
    assert "over the 8 GB cap" in result.stdout
    assert not any(c.startswith(("restic backup", "docker")) for c in calls)
    assert calls[-1] == "curl https://hc.example/ping/fail"


def test_size_cap_is_configurable(run):
    over, _ = run(FAKE_REPO_BYTES=2 * GB, credentials=CREDENTIALS + "MAX_REPO_GB=1\n")
    assert over.returncode == 1
    under, _ = run(FAKE_REPO_BYTES=2 * GB, credentials=CREDENTIALS + "MAX_REPO_GB=3\n")
    assert under.returncode == 0, under.stderr


@pytest.mark.parametrize("dump", ["fail", "empty"])
def test_backup_stops_when_database_dump_fails(run, tmp_path, dump):
    result, calls = run(FAKE_DUMP=dump)
    assert result.returncode == 1
    assert not any(c.startswith("restic backup") for c in calls)
    assert not (tmp_path / "stage" / "food.dump").exists()  # last good dump not replaced
    assert calls[-1] == "curl https://hc.example/ping/fail"


def test_failed_upload_reports_failure_and_skips_prune(run):
    result, calls = run(FAKE_BACKUP_EXIT=1)
    assert result.returncode == 1
    assert not any(c.startswith("restic forget") for c in calls)
    assert calls[-1] == "curl https://hc.example/ping/fail"


@pytest.mark.parametrize("missing", ["RESTIC_PASSWORD", "AWS_SECRET_ACCESS_KEY"])
def test_backup_requires_credentials(run, missing):
    credentials = "\n".join(
        line for line in CREDENTIALS.splitlines() if not line.startswith(missing)
    )
    result, calls = run(credentials=credentials)
    assert result.returncode == 1
    assert f"{missing} is not set" in result.stdout
    assert not any(c.startswith(("restic", "docker")) for c in calls)


def test_backup_fails_without_env_file(run, tmp_path):
    result, calls = run(BACKUP_ENV=tmp_path / "missing.env")
    assert result.returncode == 1
    assert "missing" in result.stdout
    assert calls == []


def test_second_backup_does_not_run_while_one_is_running(run):
    result, calls = run(FAKE_FLOCK_EXIT=1)
    assert result.returncode == 1
    assert "another backup is running" in result.stdout
    assert not any(c.startswith(("restic", "docker")) for c in calls)


def test_weekly_check_runs_on_check_day_only(run):
    today = datetime.date.today().isoweekday()
    result, calls = run(CHECK_WEEKDAY=today)
    assert result.returncode == 0, result.stderr
    assert "restic check" in calls  # metadata only: no --read-data download


def test_backup_without_healthcheck_url_does_not_ping(run):
    credentials = CREDENTIALS.replace("HEALTHCHECK_URL=https://hc.example/ping", "")
    result, calls = run(credentials=credentials)
    assert result.returncode == 0, result.stderr
    assert not any(c.startswith("curl") for c in calls)


def test_restore_test_verifies_dump_and_counts_photos(run):
    result, calls = run("restore-test")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "OK: dump is readable, 2 photos restored" in result.stdout
    assert any(c.startswith("restic restore latest --tag nightly") for c in calls)
    assert not any(c.startswith(("restic backup", "restic forget")) for c in calls)
    target = result.stdout.split("Restoring latest snapshot to ", 1)[1].split()[0]
    assert not Path(target).exists()  # restored copy is cleaned up


def test_restore_test_fails_when_snapshot_has_no_dump(run):
    result, _ = run("restore-test", FAKE_RESTORE_EMPTY=1)
    assert result.returncode == 1
    assert "no food.dump" in result.stdout


def test_unknown_command_is_rejected(run):
    result, calls = run("delete-everything")
    assert result.returncode == 2
    assert "usage" in result.stderr
