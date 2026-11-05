# Production performance comparison

Previous baseline: [desktop](../file-browser-navigation/performance-after.json), [mobile](../file-browser-navigation/performance-after-mobile.json). Current: [desktop](performance-after.json), [mobile](performance-after-mobile.json).

Chrome 156.0.8078.48; production Windows; 1440/390 x 900; no throttling; cache disabled; 3 samples per route; 1.2s observation. LCP/CLS via PerformanceObserver, not Lighthouse or field INP. Unconnected route-load measurements do not measure destination folder enumeration.

| Width | Route | LCP before median (range) ms | LCP after median (range) ms | Transfer after median B | JS after median B | Requests after median | Max CLS after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 | / | 128.0 (56.0-240.0) | 72.0 (68.0-248.0) | 216087 | 181091 | 24 | 0 |
| 1440 | /files | 44.0 (44.0-48.0) | 52.0 (48.0-112.0) | 216202 | 181091 | 24 | 0 |
| 1440 | /settings | 56.0 (56.0-60.0) | 76.0 (56.0-120.0) | 216150 | 181091 | 24 | 0.0017084686321159124 |
| 1440 | /login | 72.0 (56.0-88.0) | 80.0 (52.0-1020.0) | 215681 | 181091 | 24 | 0 |
| 1440 | /welcome | 52.0 (52.0-76.0) | 52.0 (48.0-800.0) | 215720 | 181091 | 24 | 0 |
| 1440 | /preview | 76.0 (72.0-80.0) | 76.0 (76.0-80.0) | 271045 | 191015 | 48 | 0 |
| 390 | / | 92.0 (52.0-172.0) | 112.0 (96.0-204.0) | 216087 | 181091 | 24 | 0 |
| 390 | /files | 48.0 (40.0-48.0) | 44.0 (44.0-148.0) | 216202 | 181091 | 24 | 0 |
| 390 | /settings | 52.0 (44.0-52.0) | 80.0 (44.0-120.0) | 216150 | 181091 | 24 | 0.010678397435897435 |
| 390 | /login | 512.0 (96.0-1008.0) | 64.0 (48.0-84.0) | 215681 | 181091 | 24 | 0 |
| 390 | /welcome | 48.0 (44.0-52.0) | 68.0 (48.0-84.0) | 215720 | 181091 | 24 | 0 |
| 390 | /preview | 68.0 (64.0-72.0) | 72.0 (68.0-76.0) | 254966 | 191015 | 42 | 0 |

Static build assets: 795297 -> 804772 B (+9475 B, +1.19%). All samples retained in JSON. Build chunking and local timing noise affect before/after numbers; this is not a universal performance claim.
