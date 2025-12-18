# 專案路由與頁面跳轉流程圖 (Routing & Navigation Flow)

本文件詳細描述 `ME2025_finalproject` 專案中的所有路由、頁面跳轉邏輯以及後端處理流程。

## 1. 符號說明

*   `[ ]` : 頁面 (Page / Template)
*   `( )` : 後端邏輯判斷 (Backend Logic / Condition)
*   `[[ ]]` : 資料庫操作 (Database Operation)
*   `-->` : 導向或跳轉 (Redirect / Navigation)
*   `..>` : 包含或呼叫 (Include / Call)

---

## 2. 系統核心流程圖 (Mermaid)

```mermaid
graph TD
    %% 入口與驗證
    Start((使用者進入)) --> Root["/ (Root)"]
    Root --> IsLoggedIn{是否已登入?}
    
    IsLoggedIn -- Yes (Session存在) --> Lobby["/lobby (大廳)<br/>[index.html]"]
    IsLoggedIn -- No --> LoginPage["/ (登入頁)<br/>[login.html]"]

    %% 註冊流程
    LoginPage -- "點擊註冊" --> RegisterPage["/register (註冊頁)<br/>[register.html]"]
    RegisterPage -- "POST /register" --> CheckUserExists{帳號是否存在?}
    CheckUserExists -- No (創建成功) --> [[DB: Create User]] --> LoginPage
    CheckUserExists -- Yes (重複) --> RegisterPage

    %% 登入流程
    LoginPage -- "POST /login" --> VerifyCreds{帳號密碼驗證}
    VerifyCreds -- 成功 --> SetSession[設定 Session] --> Lobby
    VerifyCreds -- 失敗 --> LoginPage

    %% 大廳導航
    Lobby -- "點擊遊戲" --> GameRoute["/game/<name>"]
    Lobby -- "點擊商店" --> ShopPage["/shop<br/>[shop.html]"]
    Lobby -- "點擊排行榜" --> LeaderboardPage["/leaderboard<br/>[leaderboard.html]"]
    Lobby -- "點擊個人檔案" --> ProfilePage["/profile<br/>[profile.html]"]
    Lobby -- "登出" --> LogoutRoute["/logout"]
    Lobby -- "管理員後台 (Admin Only)" --> AdminPage["/admin<br/>[admin.html]"]

    %% 遊戲流程
    GameRoute --> CheckGameValid{遊戲名稱有效?}
    CheckGameValid -- Yes --> RenderGame["[<game_name>.html]"]
    CheckGameValid -- No --> NotFound["404 Error"]
    
    RenderGame -- "JS: fetch /api/start_game" --> API_Start[紀錄開始時間]
    RenderGame -- "JS: fetch /api/submit_score" --> API_Submit{後端防作弊驗證}
    API_Submit -- 通過 --> [[DB: Insert Score]] --> ReturnSuccess[JSON: Success]
    API_Submit -- 失敗 --> [[DB: Mark Suspect]] --> ReturnError[JSON: Error]

    %% 商店流程
    ShopPage -- "JS: fetch /api/buy" --> API_Buy{餘額足夠?}
    API_Buy -- Yes --> [[DB: Deduct Points & Add Item]] --> JSON_Buy_OK
    API_Buy -- No --> JSON_Buy_Fail
    
    ShopPage -- "JS: fetch /api/equip" --> API_Equip{擁有物品?}
    API_Equip -- Yes --> [[DB: Update User Equip]] --> JSON_Equip_OK

    %% 個人檔案流程
    ProfilePage -- "POST: update_id" --> [[DB: Update Username]] --> ProfilePage
    ProfilePage -- "POST: upload_avatar" --> [[Save File & DB Update]] --> ProfilePage
    ProfilePage -- "POST: delete_account" --> [[DB: Delete User]] --> LogoutRoute

    %% 管理員流程
    AdminPage --> CheckAdmin{是否為 Admin?}
    CheckAdmin -- No --> Root
    CheckAdmin -- Yes --> RenderAdminPanel
    RenderAdminPanel -- "API: delete_user" --> [[DB: Delete Target]]
    RenderAdminPanel -- "API: clear_suspect" --> [[DB: Clear Flags]]
    
    %% 登出
    LogoutRoute --> ClearSession[清除 Session] --> Root
```

---

## 3. 詳細路由邏輯表

下表列出所有後端路由 (`app.py`) 的詳細行為與跳轉條件。

### 3.1 公開與認證路由

| URL 路徑 | HTTP 方法 | 功能 | 邏輯流程 |
| :--- | :--- | :--- | :--- |
| `/` | GET | 首頁/登入入口 | 1. 檢查 Session `user_id`<br>2. **若有**: Redirect -> `/lobby`<br>3. **若無**: Render `login.html` |
| `/register` | GET | 註冊頁面 | Render `register.html` |
| `/register` | POST | 提交註冊 | 1. 呼叫 `database.create_user`<br>2. **成功**: Render `login.html` (帶成功訊息)<br>3. **失敗**: Render `register.html` (帶錯誤訊息 "User exists") |
| `/login` | POST | 提交登入 | 1. 呼叫 `database.verify_user`<br>2. **成功**: 設定 Session -> Redirect `/lobby`<br>3. **失敗**: Render `login.html` (帶錯誤訊息) |
| `/logout` | GET | 登出 | 1. `session.clear()`<br>2. Redirect -> `/` |

### 3.2 會員核心路由 (需登入)

所有此類路由在執行前都會檢查 `get_current_user()`，若回傳 `None` 則直接強制重導向回 `/`。

| URL 路徑 | HTTP 方法 | 頁面/功能 | 邏輯與資料流 |
| :--- | :--- | :--- | :--- |
| `/lobby` | GET | 遊戲大廳 | 1. 取得使用者資料<br>2. 檢查是否有 `warning_pending`<br>3. Render `index.html` |
| `/game/<name>` | GET | 遊戲頁面 | 1. 檢查 `name` 是否在允許列表 (snake, dino, etc.)<br>2. **是**: Render `<name>.html`<br>3. **否**: Return 404 |
| `/leaderboard` | GET | 排行榜 | Render `leaderboard.html` (資料由前端 AJAX 載入) |
| `/shop` | GET | 商店 | 1. 取得錢包資訊 (`database.get_wallet_info`)<br>2. 取得擁有物品 (`database.get_user_items`)<br>3. Render `shop.html` |
| `/profile` | GET | 個人檔案 | Render `profile.html` |
| `/profile` | POST | 檔案操作 | 根據 `action` 參數執行：<br>- `update_id`: 修改 ID<br>- `upload_avatar`: 上傳圖片<br>- `apply_preset`: 套用預設頭像<br>- `delete_account`: 刪除帳號 (完成後轉 `/logout`) |

### 3.3 API 路由 (JSON Response)

這些路由不回傳 HTML，僅回傳 JSON，供前端 JavaScript (AJAX/Fetch) 呼叫。

| URL 路徑 | 方法 | 用途 | 核心邏輯 |
| :--- | :--- | :--- | :--- |
| `/api/start_game` | POST | 遊戲開始信號 | 設定 `session['game_start_time']` (用於防作弊計算) |
| `/api/submit_score` | POST | 提交分數 | **核心防作弊邏輯**：<br>1. 檢查頻率 (Rate Limit)<br>2. 計算 `duration` (當前時間 - 開始時間)<br>3. 呼叫 `validate_game_logic` 進行物理檢測<br>4. **通過**: 寫入 DB<br>5. **失敗**: 標記 User 為嫌疑犯 (`is_suspect=1`) |
| `/api/get_rank/<g>` | GET | 取得排行榜 | 回傳該遊戲前 10 名資料 |
| `/api/buy` | POST | 購買物品 | 檢查餘額 -> 扣款 -> 新增物品紀錄 |
| `/api/equip` | POST | 裝備物品 | 檢查是否擁有 -> 更新 `users` 表格的 `equipped_*` 欄位 |

### 3.4 管理員路由

權限檢查：`if not user or not user['is_admin']: redirect('/')`

| URL 路徑 | 方法 | 功能 |
| :--- | :--- | :--- |
| `/admin` | GET | 管理員面板 | 取得所有使用者列表 -> Render `admin.html` |
| `/admin/delete_user/<uid>` | POST | 刪除使用者 | 刪除指定 ID 的所有資料 (User, Scores, Items) |
| `/admin/clear_suspect/<uid>` | POST | 清除嫌疑 | 將 `is_suspect` 設為 0 |
| `/admin/warn_user/<uid>` | POST | 發送警告 | 設定 `warning_pending=1` (使用者下次登入大廳會看到警告) |

