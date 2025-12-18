# [ME2025_finalproject] 技術架構分析報告

## 1. 技術棧與系統概觀
本專案是一個基於 **Python Flask** 框架建構的輕量級線上街機遊戲平台 (Arcade Platform)。系統採用前後端分離的邏輯設計（前端處理遊戲互動，後端負責驗證與資料存取），並具備完整的會員、積分、商店與防作弊系統。

*   **後端框架**: Python Flask
*   **資料庫**: SQLite 3 (使用原生 `sqlite3` 模組操作，無 ORM，手動管理 Connection)
*   **前端技術**: HTML5 Canvas (遊戲繪圖), Vanilla JavaScript (無使用大型前端框架), CSS (Bootstrap/Tailwind 風格樣式)
*   **安全性**: Werkzeug Security (密碼雜湊), Session-based Authentication, 自定義防作弊演算法

## 2. 網站地圖與功能詳解

系統路由設計清晰，主要分為「公開頁面」、「會員功能」、「遊戲區域」與「管理員後台」四大區塊。

| 頁面/路由 | 對應模板 | 功能描述 |
|---|---|---|
| **/** | `login.html` 或 `index.html` | 入口路由。若未登入顯示登入頁；已登入則重導向至大廳 (`/lobby`)。 |
| **GET /lobby** | `index.html` | **遊戲大廳**。顯示使用者頭像、金幣、目前裝備的特效，並列出所有可遊玩的遊戲入口。 |
| **GET /register** | `register.html` | **註冊頁面**。提供使用者建立新帳號，後端會檢查帳號重複性。 |
| **GET /game/<name>** | `<game_name>.html` | **遊戲頁面**。動態路由，支援 `snake`, `tetris`, `dino`, `whac`, `memory`, `shaft` 等六款遊戲。 |
| **GET /leaderboard** | `leaderboard.html` | **排行榜**。顯示各個遊戲的前 10 名玩家，包含其頭像與裝備展示。 |
| **GET /shop** | `shop.html` | **道具商店**。玩家可消耗遊戲積分購買稱號 (Title)、頭像框 (Frame) 或大廳特效 (Effect)。 |
| **GET /profile** | `profile.html` | **個人檔案**。允許使用者上傳頭像、修改使用者名稱、切換裝備或刪除帳號。 |
| **GET /admin** | `admin.html` | **管理員後台**。僅限管理員存取，可檢視所有使用者狀態、標記/清除嫌疑犯、刪除違規帳號。 |

## 3. 核心機制分析

### 3.1 帳號與權限系統
*   **角色區分**：
    系統透過資料庫 `users` 表中的 `is_admin` 欄位 (Integer: 0 或 1) 來區分角色。
    *   **一般使用者**：僅能遊玩、上傳分數、購買道具。
    *   **管理員 (Admin)**：擁有一般使用者所有功能，並額外擁有：
        *   進入 `/admin` 面板。
        *   透過 API `/admin/delete_user` 刪除任意使用者。
        *   透過 API `/admin/clear_suspect` 解除使用者的作弊嫌疑。
        *   在商店中擁有無限金幣 (`10**12`) 以方便測試購物功能。

*   **驗證機制 (Authentication)**：
    *   **密碼儲存**：使用 `werkzeug.security.generate_password_hash` (預設為 scrypt 或 pbkdf2) 進行雜湊加密，絕不以明文儲存。
    *   **登入狀態**：使用 Flask 的 `session` 對象儲存 `user_id`。所有受保護的路由 (Protected Routes) 都會檢查 `session.get('user_id')` 是否存在。
    *   **向下相容**：`verify_user` 函式包含自動升級邏輯，若偵測到舊版明文密碼，會在登入成功後自動升級為 Hash 加密。

### 3.2 防作弊與資安設計
本專案在防作弊機制上投入了顯著的開發資源，採用「前後端雙重驗證」架構。

**A. 遊戲邏輯驗證 (後端 `app.py` - `validate_game_logic`)**
這是系統最強大的防護層。當前端 `/api/submit_score` 送出分數時，後端會根據 `session['game_start_time']` 計算出的**真實遊玩時間 (Duration)** 與分數進行物理極限比對：
*   **Snake (貪吃蛇)**：檢查移動步數 (`moves`) 是否超過時間內的物理極限 (每秒最多 10 步)；檢查是否有「瞬間移動」特徵 (分數高但步數極少)。
*   **Tetris (俄羅斯方塊)**：計算落下的方塊數 (`pieces`) 與時間的關係，防止自動落下外掛 (Auto-dropper)。
*   **Dino (恐龍跳)**：根據遊戲加速公式計算理論最高分，若分數超越物理極限則視為作弊。
*   **Whac-A-Mole (打地鼠)**：檢查點擊率 (CPS)，若超過人類極限 (如 12 CPS) 則判定為自動連點程式。
*   **處罰機制**：一旦驗證失敗，後端會自動呼叫 `database.mark_user_suspect(user_id)` 將該玩家標記為「嫌疑犯」，並拒絕錄入分數。

**B. 頻率限制 (Rate Limiting)**
*   記憶體內維護一個 `_score_submit_log` 字典。
*   限制每位使用者在 **60 秒內最多只能提交 30 次**分數，防止惡意腳本灌爆資料庫或暴力破解 API。

**C. 前端防護 (JavaScript)**
*   **可信事件檢查**：在 `handleInput` 中檢查 `event.isTrusted`，防止透過 `document.dispatchEvent` 模擬的按鍵腳本。
*   **路徑雜湊 (Path Hash)**：前端會根據玩家的操作路徑動態計算一個 Hash 值，並隨分數一同傳送。若後端驗證 Hash 缺失或不符，可視為異常 (目前程式碼中主要檢查 Hash 是否存在)。

**D. 安全漏洞與建議**
*   **CSRF 風險**：目前的表單提交 (如 Login/Register) 缺乏 CSRF Token 防護，建議補上 Flask-WTF。
*   **Hash 驗證強度**：前端的 `updateHash` 演算法 (簡單的乘法與 Mod) 寫在 JS 中，容易被逆向工程。建議後端驗證邏輯應更加隱密或採用更複雜的 Replay 資料驗證。

## 4. 資料庫設計
資料庫採用 SQLite (`arcade.db`)，主要包含三張核心資料表：

**1. users (使用者資料表)**
| 欄位名 | 類型 | 說明 |
|---|---|---|
| id | INTEGER PK | 使用者唯一識別碼 |
| username | TEXT | 帳號 (Unique) |
| password | TEXT | 雜湊後的密碼 |
| is_admin | INTEGER | 0=一般, 1=管理員 |
| spent_points | INTEGER | 已花費的積分 (餘額 = 總分 - 此欄位) |
| is_suspect | INTEGER | 1=被系統標記為作弊嫌疑 |
| equipped_* | TEXT | 紀錄目前裝備的 title/frame/effect |

**2. scores (分數紀錄表)**
| 欄位名 | 類型 | 說明 |
|---|---|---|
| id | INTEGER PK | 流水號 |
| user_id | INTEGER FK | 關聯至 users.id |
| game_name | TEXT | 遊戲代碼 (snake, dino...) |
| score | INTEGER | 獲得分數 |
| timestamp | DATETIME | 遊玩時間 |

**3. user_items (物品清單表)**
| 欄位名 | 類型 | 說明 |
|---|---|---|
| id | INTEGER PK | 流水號 |
| user_id | INTEGER FK | 擁有者 |
| item_id | TEXT | 物品代碼 (對應 `app.py` 中的 `SHOP_ITEMS`) |
| item_type | TEXT | 物品類型 (title, avatar_frame...) |

## 5. 總結
本專案是一個結構完整、邏輯嚴謹的全端作品。其最大的亮點在於**後端紮實的遊戲邏輯驗證機制**，這在一般的學生專案中相當少見，顯示開發者對於「信任邊界」(Trust Boundary) 有清晰的認識——即不信任前端傳來的任何數據。雖然前端與資料庫層面仍有優化空間 (如 CSRF 防護、Redis 快取)，但整體架構已具備小型商業運營的雛形。

