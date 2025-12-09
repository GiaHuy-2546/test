1. Khởi động server:

- Chạy file start.bat là admin-panel sẽ tự động được bật kèm giao diện. Thao tác với việc tắt/mở server và quản lý client trên đó.

2. Đối với Client: Yêu cầu kết nối chung 1 mạng (LAN)

a. Sử dụng đường dẫn trên giao diện Admin-panel:

Có thể truy cập trực tiếp vào web client từ trình duyệt mà không cần cài đặt gì cả.

b. Sử dụng client độc lập:

Đảm bảo việc có thư mục client trên máy. Chạy file client.html để mở giao diện. Nhập IP của máy server (Có thể lấy từ giao diện của Admin-panel) để truy cập.

3. Lệnh build trên VSCode:

- Vào thư mục Project
- Nhập:
  g++ -std=c++17 Server/server.cpp Server/CommandRouter.cpp Server/controllers/AppController.cpp Server/controllers/DeviceController.cpp Server/controllers/KeylogController.cpp Server/controllers/ProcessController.cpp Server/controllers/ScreenController.cpp Server/controllers/SystemController.cpp Server/utils/helpers.cpp Server/utils/logging.cpp Server/utils/escapi.cpp -o core/server.exe -lws2_32 -lgdiplus -lgdi32 -luser32 -lshlwapi -lpsapi -liphlpapi -lole32 -lwinmm -static-libgcc -static-libstdc++
