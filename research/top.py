# 次の天井の見込みの根拠（アプリの TOPS / ELAS の元）
import csv,json,math,datetime as dt
r=[x for x in csv.DictReader(open('btc.csv'))]; D=[x['date'] for x in r]; C=[float(x['close']) for x in r]; I={d:i for i,d in enumerate(D)}
lows=['2015-01-14','2018-12-15','2022-11-21']; tops=['2013-12-04','2017-12-16','2021-11-08','2025-10-06']; P=lambda d:C[I[d]]
print('底→次の天井:',[round(P(t)/P(l),1) for l,t in zip(lows,tops[1:])])
print('天井→次の天井:',[round(P(tops[k+1])/P(tops[k]),2) for k in range(3)])
