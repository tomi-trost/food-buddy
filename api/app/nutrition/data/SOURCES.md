# Nutrition data sources

- `usda_catalog.csv`: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, SR Legacy (2018-04). Public domain (CC0). https://fdc.nal.usda.gov
- `ciqual_catalog.csv`: ANSES. Ciqual French food composition table, 2020. Open licence (Etalab), attribution required: "ANSES-CIQUAL". https://ciqual.anses.fr

Both are hand-picked subsets (see `api/scripts/*_catalog.txt`), values per 100 g. Rows without an energy value in Ciqual get it computed from the macros with the EU label factors (4/4/9, fibre 2); missing fibre or sugar counts as 0 (the build script prints which rows).
