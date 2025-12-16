# Hệ thống điều khiển máy tình từ xa trong LAN

Chào mọi người, bọn mình xin giới thiệt hệ thống điều khiển máy tính từ xa, sử dụng kiến trúc Hybrid giữa **C++ (Backend)** và **Node.js (Gateway)**, cho phép quản lý và thực hiện các thao tác trên máy tính **Server** thông qua giao diện **Web Client**.

![Banner](public/image/background.jpg)

## Tính Năng Chính

Hệ thống cung cấp nhiều công cụ quản trị từ xa như:

- **Quản Lý Ứng Dụng:**
  - Liệt kê các cửa sổ ứng dụng đang mở.
  - Đóng cửa sổ, mở ứng dụng mới hoặc chạy lệnh CMD từ xa.
- **⚙️ Quản Lý Tiến Trình (Task Manager):**
  - Xem danh sách các tiến trình đang chạy.
  - Buộc dừng (Kill Process) các tiến trình.
- **Quản lý màn hình:**
  - Xem màn hình trực tiếp với chế độ chụp màn hình và xem stream.
  - Hỗ trợ điều khiển **Chuột** và **Bàn phím** trên giao diện stream.
- **Keylogger:**
  - Ghi lại phím bấm thời gian thực.
  - Hỗ trợ bật/tắt chế độ ghi log từ xa.
- **Camera & Audio:**
  - Xem trực tiếp Webcam trên máy Server kèm âm thanh.
  - Quay và lưu video ngay trên trình duyệt Client.
- **Điều Khiển Nguồn:**
  - Tắt máy (Shutdown) hoặc Khởi động lại (Restart) từ xa.

## 🛠️ Kiến Trúc Hệ Thống

1.  **Server (C++):**
    - Chạy trực tiếp trên máy cần điều khiển.
    - Sử dụng **Winsock** cho kết nối TCP, **GDI+** để xử lý hình ảnh, và **ESCAPI** cho Webcam.
    - Tối ưu hóa tốc độ xử lý và truy cập sâu vào API Windows.
2.  **Gateway (Node.js):**
    - Đóng vai trò cầu nối trung gian.
    - Chuyển đổi giao thức giữa **WebSocket** (Web Client) và **TCP Socket** (C++ Server).
    - Quản lý xác thực và phân luồng dữ liệu.
3.  **Client (Web - HTML/CSS/JS):**
    - Giao diện người dùng Single Page Application (SPA).
    - Không cần cài đặt, chạy trên mọi trình duyệt hiện đại.
4.  **Admin Panel (Node.js):**
    - Giao diện giúp máy Server quản lý các **Client** truy cập vào.
    - Hiển thị **Log** của tất cả các tiến trình giao tiếp giữa **CLient - Gateway - Server**.

## Cài Đặt & Hướng Dẫn Sử Dụng

### Cài đặt:

1. **Yêu Cầu Hệ Thống:**

   - **Hệ điều hành**: Windows (Nên là 10/11).

   - **Môi trường**: Node.js (v14 trở lên, phải cài đặt trước trên máy).

   - **Compiler**: Đối với lập trình viên muốn sửa ứng dụng, dùng Visual Studio (MSVC) hoặc MinGW để biên dịch mã C++.

2. **Biên Dịch Server (C++) - Dành cho lập trình viên**

   - Mở project trong Server/ bằng Visual Studio.

   - Cấu hình Linker để liên kết các thư viện: ws2_32.lib, gdiplus.lib, user32.lib, gdi32.lib, shell32.lib.

   - Build ra file thực thi (ví dụ: server.exe).

   - **Quan trọng:** Copy file server.exe vừa tạo vào thư mục core/ (cùng cấp với gateway.js và escapi.dll).

### Sử dụng

#### Đối với máy Server

1. **Cách khởi chạy đơn giản**

- Chỉ cần chạy file script **start.bat** thì mọi thứ sẽ được thực hiện:

2. **Chạy thủ công**

- Nếu chạy lần đầu, mở Terminal tại thư mục core/ và chạy: **npm install**

- Chạy thủ công bằng lệnh: **node core/admin-panel.js**

- Mở trình duyệt và truy cập: http://localhost:8000

#### Đối với máy Client:

1. **Truy cập trực tiếp**: Mở trên trình duyệt đường dẫn dạng http://ServerIP:8080 (Có hiển thị trên Admin Panel)

2. **Sử dụng Client tách biệt**:

- Yêu cầu máy Client phải tải thư mục Client.
- Mở file **client.html**.
- Nhập IP của máy Server cần kết nối.

## Lưu Ý & Cảnh Báo

1. **Quyền Admin**: Một số tính năng như Kill Process hoặc Shutdown có thể yêu cầu Server chạy dưới quyền Administrator.

2. **Giữ nguyên cấu trúc thư mục**: Không làm thay đổi cấu trúc thư mục (Vị trí, tên tệp) để ứng dụng được chạy 1 cách an toàn.

3. **Mục đích**: Phần mềm này được phát triển cho mục đích học tập và nghiên cứu của môn học **Mạng máy tính**. Nghiêm cấm chỉnh sửa và sử dụng cho các mục đích xâm nhập trái phép hoặc vi phạm pháp luật.

4. **Thành viên nhóm**:

- Võ Lê Gia Huy - MSSV: 24122004
- Lê Bảo Phúc - MSSV: 24122021
- Trần Xuân Bách - MSSV: 24122028

  Sinh viên Khóa 24, ngành Trí tuệ Nhân tọa, khoa Công nghệ Thông tin, trường Đại học Khoa học Tự nhiên - ĐHQG TPHCM.

## 📂 Cấu Trúc Thư Mục

```text
├── core/                  # Thư mục chính
│   ├── gateway.js         # Gateway
│   ├── admin-panel.js     # Quản lý khởi chạy hệ thống
│   ├── escapi.dll         # Thư viện hỗ trợ Webcam
|   ├── server.exe         # File Server chính
│   └── ...
├── public/                # Frontend
│   ├── app.js             # Logic chính của Client
│   ├── modules/           # Các module chức năng
│   └── ...
├── Server/                # Mã nguồn C++ (Backend)
│   ├── server.cpp         # Điểm khởi chạy Server
│   ├── CommandRouter.cpp  # Bộ định tuyến lệnh
│   ├── controllers/       # Các bộ xử lý chức năng
│   └── utils/             # Các hàm tiện ích bổ trợ
└── start.bat              # Script khởi động hệ thống
```
