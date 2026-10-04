import os
import subprocess
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent


def test_worker_process_registers_every_model():
    """The worker imports only its task modules (not app.main); all ORM tables must still resolve.

    Regression: analysis_job's foreign key to household failed in the worker container.
    """
    code = (
        "from app.jobs import jobs_app\n"
        "jobs_app.perform_import_paths()\n"
        "from app.db import Base\n"
        "Base.metadata.sorted_tables\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=API_DIR, env=os.environ, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr
