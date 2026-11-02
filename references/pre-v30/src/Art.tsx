import { useId } from 'react'
import { concepts, conceptNames, bodyActionConcepts, themeConcepts, oceanConcepts, dailyConcepts, wardrobeGardenConcepts, vehicleConcepts, familyVehicleConcepts } from './content'
import type { Concept } from './content'

// Per-object framing keeps the original transparent atlas intact.
const englishViewBoxes = [
  '18.842 44.842 276.316 276.316', // cow
  '327.132 80.632 219.737 219.737', // pig
  '560.947 45.447 267.105 267.105', // horse
  '859.894 75.394 234.211 234.211', // sheep
  '47.394 347.894 209.211 209.211', // grape
  '314.526 340.526 228.947 228.947', // pear
  '598.658 363.158 198.684 198.684', // milk
  '855.369 352.868 230.263 230.263', // bread
  '41.0 624.0 200.0 200.0', // egg
  '326.316 617.816 222.368 222.368', // cup
  '595.394 621.894 209.211 209.211', // spoon
  '866.631 622.131 219.737 219.737', // bowl
  '30.316 857.816 247.368 247.368', // hat
  '320.0 866.5 225.0 225.0', // shoe
  '594.342 873.842 201.316 201.316', // sock
  '860.842 863.842 226.316 226.316', // train
  '42.894 1121.394 209.211 209.211', // star
  '308.632 1111.131 244.737 244.737', // cloud
  '579.5 1108.0 250.0 250.0', // tree
  '861.474 1112.474 246.053 246.053', // flower
]

const wardrobeGardenFrames = [
  {"points":"18,135 19,134 27,127 63,98 81,84 88,79 95,75 101,72 124,61 135,57 138,56 267,56 282,62 318,80 378,128 385,135 385,147 333,326 332,328 328,330 324,331 303,336 286,340 276,342 270,343 257,345 249,346 238,347 216,348 204,348 182,347 172,346 153,344 146,343 140,342 124,339 77,330 73,329 70,328 68,327 67,325 18,150","view":[-3.13,-2.63,409.26,409.26]},
  {"points":"412,321 414,303 437,145 441,119 446,92 453,60 456,49 457,46 458,44 460,42 462,41 644,41 646,42 648,44 649,46 653,62 661,96 662,101 665,118 666,124 693,302 695,318 695,331 694,334 693,336 692,337 690,338 685,340 675,343 655,348 640,351 619,354 606,355 500,355 488,354 479,353 472,352 462,350 448,347 435,344 431,343 419,339 415,337 414,336 413,334 412,331","view":[379.08,23.58,348.84,348.84]},
  {"points":"726,301 763,94 764,90 766,85 770,79 785,64 789,61 799,56 803,55 851,44 957,44 1007,55 1011,56 1019,60 1025,64 1027,66 1038,78 1042,83 1043,85 1045,90 1082,302 1082,312 1080,316 1076,320 1073,322 1045,339 1039,342 1032,344 1028,345 982,356 904,363 870,363 802,352 796,351 792,350 789,349 782,346 738,324 735,322 731,319 727,315 726,313","view":[705.64,5.14,396.72,396.72]},
  {"points":"1086,223 1093,200 1094,197 1095,195 1145,113 1154,99 1177,68 1183,62 1200,47 1204,44 1208,42 1211,41 1215,40 1298,40 1302,41 1306,43 1311,46 1331,63 1334,66 1357,98 1366,111 1418,195 1428,225 1428,233 1427,236 1397,322 1396,324 1395,325 1392,327 1390,328 1375,334 1352,342 1345,344 1334,347 1330,348 1320,350 1306,352 1263,358 1244,358 1218,356 1201,354 1195,353 1185,351 1165,346 1152,342 1140,338 1129,334 1124,332 1117,328 1116,327 1115,325 1086,236","view":[1066.62,8.62,380.76,380.76]},
  {"points":"18,620 19,617 111,418 114,413 118,408 123,403 132,397 144,391 149,389 156,387 164,385 173,383 179,382 192,380 205,379 224,379 234,380 240,381 249,383 261,386 267,388 272,390 276,392 279,394 287,400 294,407 304,419 308,427 390,630 391,633 391,642 386,647 373,656 359,664 341,674 324,682 295,695 268,701 258,701 138,689 118,685 103,679 84,671 71,665 52,654 42,648 23,634 18,629","view":[-3.55,331.95,416.1,416.1]},
  {"points":"407,606 419,528 420,522 421,518 445,434 449,422 455,410 457,407 463,401 465,400 538,375 542,374 558,374 562,375 640,401 642,402 645,404 647,407 653,419 676,472 679,480 681,487 683,495 684,500 686,511 698,595 699,603 700,612 700,633 699,641 698,646 697,650 694,659 691,665 688,669 683,675 681,677 676,681 674,682 666,685 663,686 648,689 642,690 621,693 611,694 589,696 574,697 557,698 509,698 503,697 498,696 488,693 480,690 469,685 457,679 425,656 419,651 414,646 412,643 409,637 407,631","view":[373.38,355.88,360.24,360.24]},
  {"points":"727,426 728,421 729,418 730,416 732,413 736,409 740,407 743,406 749,405 850,395 959,395 1058,405 1064,406 1067,407 1071,409 1074,411 1077,414 1080,420 1081,426 1081,443 1080,450 1052,621 1051,626 1049,635 1047,641 1043,649 1038,657 1036,660 1032,665 1030,667 1013,680 1003,685 997,687 993,688 816,688 811,687 805,685 795,680 792,678 779,668 772,661 770,658 765,650 761,642 759,637 758,633 756,624 755,619 727,444","view":[706.78,344.28,394.44,394.44]},
  {"points":"1108,452 1109,449 1114,444 1172,425 1315,385 1338,385 1341,386 1345,388 1425,434 1428,436 1430,438 1434,446 1435,450 1435,472 1434,477 1395,638 1392,648 1386,666 1385,668 1345,713 1339,715 1329,715 1208,696 1164,674 1163,673 1138,632 1108,461","view":[1087.96,366.46,367.08,367.08]},
  {"points":"35,993 41,898 44,886 48,875 52,867 55,862 58,858 62,853 75,840 83,834 280,718 282,717 285,716 295,716 378,742 381,743 383,744 384,745 385,747 385,760 329,994 328,996 303,1024 298,1025 230,1036 215,1036 116,1026 41,1007 35,1005","view":[15.06,681.06,389.88,389.88]},
  {"points":"374,954 404,856 408,844 414,830 416,826 424,814 428,809 442,795 447,791 456,785 463,781 475,775 481,773 493,770 498,769 651,743 669,743 729,748 733,750 736,752 737,753 740,759 740,775 719,876 718,880 716,885 715,887 668,976 664,982 656,990 629,1004 619,1009 614,1011 611,1012 607,1013 601,1014 534,1017 515,1017 492,1016 484,1015 478,1014 473,1013 469,1012 429,999 423,997 410,991 391,980 382,974 377,969 375,966 374,963","view":[352.94,675.94,408.12,408.12]},
  {"points":"749,986 760,888 761,882 762,877 764,869 768,857 770,852 777,838 782,830 784,827 787,823 794,814 803,805 813,796 819,791 834,781 839,778 850,773 858,770 867,767 877,765 883,764 893,763 918,763 1022,764 1074,780 1077,783 1078,785 1078,799 1066,984 1065,985 1012,1020 1007,1022 939,1038 931,1038 823,1032 818,1030 755,999 750,996 749,995","view":[730.53,717.53,365.94,365.94]},
  {"points":"1115,840 1116,835 1118,827 1119,824 1122,817 1127,807 1131,800 1135,794 1138,790 1145,781 1149,776 1154,770 1177,747 1184,742 1193,736 1202,731 1206,729 1213,726 1225,722 1229,721 1239,719 1246,718 1279,718 1286,719 1301,722 1316,727 1325,731 1332,735 1347,745 1355,752 1370,767 1380,778 1389,790 1395,799 1399,806 1400,808 1404,818 1407,827 1408,832 1409,838 1409,859 1408,865 1406,871 1342,1007 1339,1013 1335,1019 1327,1027 1321,1031 1317,1033 1312,1035 1304,1037 1290,1039 1256,1039 1238,1038 1220,1036 1215,1035 1211,1034 1208,1033 1200,1029 1195,1026 1187,1018 1183,1012 1181,1008 1117,870 1116,867 1115,862","view":[1083.59,700.09,356.82,356.82]},
]

const familyVehicleFrames = [{"points": "19,440 21,422 22,414 25,400 27,392 31,384 41,369 50,357 54,352 66,340 275,213 286,207 300,200 309,196 314,194 320,192 345,186 350,185 374,181 381,180 396,178 415,176 432,175 463,174 497,174 527,175 579,178 589,179 597,180 607,182 620,185 624,186 640,191 655,197 661,200 674,207 679,210 705,227 725,242 730,246 756,267 767,276 782,289 783,290 785,294 790,366 791,390 791,393 790,423 788,433 786,442 785,446 772,489 770,495 763,509 761,512 751,522 748,524 744,526 740,527 430,589 424,590 413,591 398,591 387,590 94,557 82,555 73,552 63,547 59,544 31,518 24,511 19,501", "view": [-33.9, -56.4, 877.8, 877.8]}, {"points": "788,434 795,406 796,403 808,371 813,361 815,358 819,354 827,348 1027,210 1032,207 1079,181 1087,177 1093,175 1105,172 1110,171 1117,170 1129,169 1312,166 1343,166 1356,167 1364,168 1370,169 1385,172 1394,174 1405,177 1408,178 1415,182 1451,205 1454,207 1458,210 1461,213 1464,217 1524,313 1525,315 1526,318 1527,322 1528,332 1531,379 1532,428 1532,434 1531,441 1530,447 1529,452 1512,517 1509,526 1503,538 1500,542 1496,547 1491,551 1483,555 1478,556 1195,605 1183,606 1176,606 1160,605 863,576 849,574 845,573 837,569 834,567 828,561 822,553 793,508 790,502 788,466", "view": [737.06, -36.94, 845.88, 845.88]}, {"points": "1571,438 1574,421 1577,409 1579,405 1582,402 1718,295 1721,293 1901,197 1903,196 1907,195 1958,192 1974,192 1977,193 1981,195 2029,228 2041,240 2044,244 2046,247 2140,430 2151,452 2154,462 2156,472 2157,480 2157,507 2156,513 2155,518 2154,522 2152,529 2151,532 2148,539 2145,545 2141,552 2138,557 2136,560 2127,570 2124,573 2118,578 2114,581 2104,588 2102,589 2089,595 2079,598 2071,600 2064,601 2055,602 2042,602 1660,599 1654,598 1649,597 1645,596 1642,595 1634,592 1624,587 1615,581 1606,574 1601,569 1595,562 1592,558 1590,555 1584,545 1580,537 1578,532 1574,520 1572,511 1571,501", "view": [1531.12, 64.12, 665.76, 665.76]}]

const dailyFrames = [
  {"clip": [0, 0, 280, 284], "view": [29.26, 31.26, 256.48, 256.48]},
  {"clip": [280, 0, 281, 284], "view": [289.46, 22.96, 262.08, 262.08]},
  {"clip": [561, 0, 280, 284], "view": [587.56, 37.56, 250.88, 250.88]},
  {"clip": [841, 0, 281, 284], "view": [860.18, 29.68, 248.64, 248.64]},
  {"clip": [0, 284, 280, 304], "view": [-8.04, 274.96, 318.08, 318.08]},
  {"clip": [280, 284, 277, 304], "view": [277.5, 279.5, 308.0, 308.0]},
  {"clip": [557, 284, 293, 304], "view": [557.84, 289.34, 292.32, 292.32]},
  {"clip": [850, 284, 272, 304], "view": [834.1, 288.1, 296.8, 296.8]},
  {"clip": [0, 588, 280, 232], "view": [23.26, 574.26, 256.48, 256.48]},
  {"clip": [280, 588, 268, 232], "view": [284.72, 566.72, 266.56, 266.56]},
  {"clip": [548, 588, 287, 232], "view": [543.62, 555.12, 305.76, 305.76]},
  {"clip": [835, 588, 287, 232], "view": [820.04, 561.54, 297.92, 297.92]},
  {"clip": [0, 820, 258, 270], "view": [-2.12, 814.88, 282.24, 282.24]},
  {"clip": [258, 820, 295, 270], "view": [253.26, 807.76, 312.48, 312.48]},
  {"clip": [553, 820, 299, 270], "view": [553.68, 807.68, 304.64, 304.64]},
  {"clip": [852, 820, 270, 270], "view": [842.7, 831.2, 285.6, 285.6]},
  {"clip": [0, 1090, 279, 312], "view": [15.84, 1083.84, 264.32, 264.32]},
  {"clip": [279, 1090, 299, 312], "view": [265.78, 1062.28, 321.44, 321.44]},
  {"clip": [578, 1090, 278, 312], "view": [571.0, 1080.0, 280.0, 280.0]},
  {"clip": [856, 1090, 266, 312], "view": [854.16, 1083.66, 267.68, 267.68]},
]

export function Art({ concept, alternate = false, className = '' }: { concept: string; alternate?: boolean; className?: string }) {
  const clipId = useId()
  const index = (concepts as readonly string[]).indexOf(concept)
  if (index < 0) return <span className={`art legacy-toy ${className}`} role="img" aria-label={concept}>✿</span>
  if (concept === 'bus') return <span role="img" aria-label={conceptNames.bus} className={`art ${className}`} style={{backgroundImage:'url(/assets/city-bus-v28.png)',backgroundSize:'contain',backgroundPosition:'center'}} />
  if (concept === 'red-monster' && !alternate) return <span role="img" aria-label={conceptNames['red-monster']} className={`art ${className}`} style={{backgroundImage:'url(/assets/red-monster.png)',backgroundSize:'contain',backgroundPosition:'center'}} />
  const familyIndex = (familyVehicleConcepts as readonly string[]).indexOf(concept)
  if (familyIndex >= 0) {
    const { points, view } = familyVehicleFrames[familyIndex]
    return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`}><svg viewBox={view.join(' ')} width="100%" height="100%" aria-hidden="true" style={{display:'block',overflow:'hidden'}}><defs><clipPath id={clipId}><polygon points={points}/></clipPath></defs><image href="/assets/family-vehicles-v28.png" width="2172" height="724" clipPath={`url(#${clipId})`}/></svg></span>
  }
  const vehicleIndex = (vehicleConcepts as readonly string[]).indexOf(concept)
  if (vehicleIndex >= 0) {
    const [left, top, width, height] = [[12,237,647,398],[679,74,772,563],[1485,185,667,465]][vehicleIndex]
    const size = Math.max(width, height) * 1.1
    const view = [left + width / 2 - size / 2, top + height / 2 - size / 2, size, size]
    return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`}><svg viewBox={view.join(' ')} width="100%" height="100%" aria-hidden="true" style={{display:'block',overflow:'hidden'}}><defs><clipPath id={clipId}><rect x={left} y={top} width={width} height={height}/></clipPath></defs><image href="/assets/vehicles-v27.png" width="2172" height="724" clipPath={`url(#${clipId})`}/></svg></span>
  }
  const wardrobeIndex = (wardrobeGardenConcepts as readonly string[]).indexOf(concept)
  if (wardrobeIndex >= 0) {
    const { points, view } = wardrobeGardenFrames[wardrobeIndex]
    return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`}><svg viewBox={view.join(' ')} width="100%" height="100%" aria-hidden="true" style={{display:'block',overflow:'hidden'}}><defs><clipPath id={clipId}><polygon points={points}/></clipPath></defs><image href="/assets/wardrobe-garden-v26.png" width="1448" height="1086" clipPath={`url(#${clipId})`}/></svg></span>
  }
  const dailyIndex = (dailyConcepts as readonly string[]).indexOf(concept)
  if (dailyIndex >= 0) {
    const { clip: [x, y, width, height], view } = dailyFrames[dailyIndex]
    return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`}><svg viewBox={view.join(' ')} width="100%" height="100%" aria-hidden="true" style={{display:'block',overflow:'hidden'}}><defs><clipPath id={clipId}><rect x={x} y={y} width={width} height={height}/></clipPath></defs><image href="/assets/daily-discoveries-v19.png" width="1122" height="1402" clipPath={`url(#${clipId})`}/></svg></span>
  }
  const oceanIndex = (oceanConcepts as readonly string[]).indexOf(concept)
  if (oceanIndex >= 0) {
    const [x, y, width, height] = [[0,0,415,410],[415,0,480,410],[895,0,459,410],[1354,0,420,410],[0,410,480,477],[480,410,477,477],[957,410,423,477]][oceanIndex]
    return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`}><svg viewBox={`${x} ${y} ${width} ${height}`} width="100%" height="100%" aria-hidden="true" style={{display:'block',overflow:'hidden'}}><defs><clipPath id={clipId}><rect x={x} y={y} width={width} height={height}/></clipPath></defs><image href="/assets/ocean-family-v16.png" width="1774" height="887" clipPath={`url(#${clipId})`}/></svg></span>
  }
  const themeIndex = (themeConcepts as readonly string[]).indexOf(concept)
  if (themeIndex >= 0) {
    const edges = [[0,370,740,1120,1448],[0,375,725,1100,1448],[0,425,725,1090,1448]][Math.floor(themeIndex / 4)]
    const x = edges[themeIndex % 4], y = Math.floor(themeIndex / 4) * 362, width = edges[themeIndex % 4 + 1] - x, height = themeIndex === 0 ? 345 : 362
    return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`}><svg viewBox={`${x} ${y} ${width} ${height}`} width="100%" height="100%" aria-hidden="true" style={{display:'block',overflow:'hidden'}}><defs><clipPath id={clipId}><rect x={x} y={y} width={width} height={height} /></clipPath></defs><image href="/assets/themes-v13.png" width="1448" height="1086" clipPath={`url(#${clipId})`} /></svg></span>
  }
  const bodyIndex = (bodyActionConcepts as readonly string[]).indexOf(concept)
  if (bodyIndex >= 0) return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`}><svg viewBox={`${bodyIndex % 4 * 443.5} ${bodyIndex < 4 ? 0 : 414} 443.5 ${bodyIndex < 4 ? 414 : 473}`} width="100%" height="100%" aria-hidden="true" style={{display:'block',overflow:'hidden'}}><defs><clipPath id={clipId}><rect x={bodyIndex % 4 * 443.5} y={bodyIndex < 4 ? 0 : 414} width="443.5" height={bodyIndex < 4 ? 414 : 473} /></clipPath></defs><image href="/assets/body-actions-v11.png" width="1774" height="887" clipPath={`url(#${clipId})`} /></svg></span>
  if (index >= 20) return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`}><svg viewBox={englishViewBoxes[index - 20]} width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'hidden' }}><image href="/assets/concepts-english-v8.png" width="1122" height="1402" /></svg></span>
  const expanded = index >= 8
  const cell = expanded ? index - 8 : index
  const rows = expanded ? 3 : 2
  return <span role="img" aria-label={conceptNames[concept as Concept]} className={`art ${className}`} style={{
    backgroundImage: `url(/assets/concepts${expanded ? '-expanded' : ''}${alternate ? '-alternate' : ''}.png)`,
    backgroundSize: `400% ${rows * 100}%`,
    backgroundPosition: `${(cell % 4) * 100 / 3}% ${Math.floor(cell / 4) * 100 / (rows - 1)}%`,
  }} />
}
