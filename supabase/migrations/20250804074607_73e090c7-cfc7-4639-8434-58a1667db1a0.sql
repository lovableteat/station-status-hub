-- 修復用戶密碼雜湊問題
-- 為現有用戶重新設定正確的密碼雜湊

UPDATE system_users 
SET password_hash = hash_password('test123')
WHERE username IN ('LA2000828', 'LA1401490', 'LA2400540', 'LA0804677', 'LA2400588', '111') 
AND role = 'engineer';