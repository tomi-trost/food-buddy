# Nutrition data sources

- `usda_catalog.csv`: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, SR Legacy (2018-04). Public domain (CC0). https://fdc.nal.usda.gov
- `ciqual_catalog.csv`: ANSES. Ciqual French food composition table, 2020. Open licence (Etalab), attribution required: "ANSES-CIQUAL". https://ciqual.anses.fr
- `full_foods.csv.gz`: the rest of both tables above (same sources and licences), minus baby food, USDA's branded and quality-control groups and Ciqual's bottled mineral waters (decision 0022).
- Barcode lookups (`GET /api/barcode/{code}`, cached in the database, not in this folder): Open Food Facts, https://world.openfoodfacts.org, Open Database License (ODbL); product data © Open Food Facts contributors.

The two `*_catalog.csv` files are hand-picked subsets (see `api/scripts/*_catalog.txt`), values per 100 g. Rows without an energy value in Ciqual get it computed from the macros with the EU label factors (4/4/9, fibre 2); missing fibre or sugar counts as 0 (the build script prints which rows).
