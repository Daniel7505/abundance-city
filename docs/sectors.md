# Sector roadmap

This is the first cut of the sector accounts. It is a yearly price-and-cost model for ten years. It does not replace the daily settlement, and it does not move the abundance price dial. A later time slider can read `data/sector-roadmap.json` (`schema` `abundance-city.sector-roadmap.v1`). Each cost-of-living row is one year, one wage policy, and one income fifth.

## What is verified

Dollar baselines are the 2024 Consumer Expenditure Surveys, Table 1101, quintiles of income before taxes. Means were read from the BLS LABSTAT series that fill that table. Quintile totals match Table C of the 19 December 2025 news release. Shares below are the item mean divided by that fifth's average annual expenditures, which is the Table 1101 definition, rounded half up to one decimal.

Housing as a share of total spending runs 41.6, 38.3, 36.0, 32.6, and 29.3 percent from the lowest fifth to the highest. Food runs 15.7, 14.8, 13.6, 13.2, and 11.3 percent. The pair 41.3 and 15.6 percent is the 2023 table, not 2024. The high end, 29.3 and 11.3, does match 2024.

The all-consumer-unit shares already in the town file match Table B of that news release: housing 33.4 percent, transportation 17.0 percent, food 12.9 percent, healthcare 7.9 percent, average spending $78,535. Those numbers were left as they are. The daily model still applies the 12.9 percent food share to ACS income. That is a model choice, not the Table B definition, and it was not changed.

The housing-needs targets in `data/coefficients.json` (0.42 down to 0.28) are a different object: an unverified target for housing inside the simulated subsistence basket. They are not Table 1101 shares, and they were left in place so the daily runs do not move.

Kansas residential use is EIA Table 5A for 2024: 875.66 kWh a month. The model keeps 875. The 15.27 cents/kWh price in the town file is marked unverified. The current Table 5.6.A (August 2026) shows 15.47 cents/kWh for Kansas residential, and the July 2026 release the 15.27 vintage names was not available to re-read. The price was not replaced.

Logistics has no household line in Table 1101. No share was invented. The logistics P&L is computed, and its price is not added to the cost of living.

## Basket

Sectors do not overlap. Housing in the basket is CE housing minus utilities. Transport is CE transportation minus vehicle insurance. Healthcare is CE healthcare minus health insurance. Insurance is health insurance, vehicle insurance, and life insurance. Social Security and retirement contributions are not treated as a cost of living. Food is total food. Utilities include electricity, so electricity is not added again.

At the 2024 baseline the basket is $28,785 for the lowest fifth (82 percent of that fifth's $35,046 of total spending) and $97,510 for the highest fifth (65 percent of $150,342). The gap is pensions and the other spending Table 1101 records outside these sectors.

## Assumptions

Abundance runs in a straight line from 0 in year 0 to 1 in year 10. That schedule belongs to this roadmap. The daily sim still uses its own logistic path when a run asks for one.

The wage bill does not grow when supply grows. Extra output comes from automation. Under MarketWages the wage bill is the year-0 labor bill times the labor that has not been shed. Under WageGuarantee the wage bill stays at the year-0 bill, which is this roadmap's form of leaving the staff in place. The consumer price passes through that policy's unit cost. In the daily sim the goods price dial does not depend on wage policy, and the producer pays the top-up. This file does not change that dial.

Housing uses the existing dwelling-rent split: land does not automate, maintenance labor is fully shed under MarketWages, and material costs fall by the coefficient already in `housingDwellingRent`. The other sectors use the assumptions in `data/sectors.json`. Those labor shares, automatability rates, nonlabor cost declines, output growth rates, and pass-through rates are assumptions. They are not survey estimates. Healthcare's automatability is 0.25, the same placeholder already used for health-care jobs.

## Results

Cost of the verified basket, dollars per year. Year 0 is the same under both policies.

| Income fifth | Year 0 | Year 10, MarketWages | Year 10, WageGuarantee |
| --- | ---: | ---: | ---: |
| Lowest | 28,785 | 18,390 | 23,555 |
| Second | 40,135 | 25,892 | 32,975 |
| Third | 50,958 | 32,662 | 41,821 |
| Fourth | 65,036 | 41,741 | 53,375 |
| Highest | 97,510 | 61,871 | 79,828 |

Nearest dollar. The series file keeps cents.

### Takeaways

The lowest fifth's housing share of total spending in 2024 is 41.6 percent, and its food share is 15.7 percent. The highest fifth is 29.3 percent housing and 11.3 percent food. The 41.3 and 15.6 figures are the previous year's table.

By year 10 the basket costs about 36 percent less under MarketWages and about 18 percent less under WageGuarantee, for every income fifth. The mix of the basket shifts that percent by less than one point. What differs across fifths is the level: the lowest fifth's basket starts at $28,785 and the highest at $97,510.

The guarantee is the more expensive basket because the year-0 wage bill stays in unit cost. MarketWages sheds automatable labor, and the pass-through sends that saving to the price. Housing shows it most clearly. With maintenance labor gone and land rent left standing, the housing price index is 0.52 under MarketWages and 0.80 under WageGuarantee.

Healthcare barely moves. Its labor is only partly automatable, and only 40 percent of any cost decline is passed into the price, so the year-10 price index is 0.90 under MarketWages and 0.95 under WageGuarantee.

The daily simulation's results are unchanged. The corrected quintile shares are new inputs to this roadmap. The town file's expenditure shares, the food share applied to income, the unverified housing-needs targets, and the electricity price were not rewritten.
