-- 足跡:只是去過、不算哪一趟旅行的地點(例如從時間軸匯入的國內縣市)。
-- 一筆一個地點,start_date 為第一次去的日期;不出現在旅程清單,只在「足跡」分頁與地圖上。
alter table trips drop constraint trips_kind_check;
alter table trips add constraint trips_kind_check check (kind in ('trip', 'lived', 'footprint'));
