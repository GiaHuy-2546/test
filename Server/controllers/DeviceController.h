// controllers/DeviceController.h
#ifndef DEVICECONTROLLER_H
#define DEVICECONTROLLER_H

#include <winsock2.h>
#include <string>
#include <mutex>
#include <atomic>
#include <vector>
#include <fstream> // Can cho ofstream
#include <map>

struct RecordingSession
{
    SOCKET client;
    std::string correlationId;
    std::string tempFilename; // File .mjpeg tam
    std::string finalPath;    // File .mp4 cuoi cung
    std::ofstream fileStream; // Luong ghi file
    time_t endTime;           // Thoi gian ket thuc
    std::mutex *socketMutex;  // De gui phan hoi JSON khi xong
};

class DeviceController
{
public:
    static void buildDeviceListJson();
    static std::string getDevices(bool refresh = false);

    // Ham nay se KHONG goi system() nua, ma chi dang ky session quay
    void recordVideoAsync(SOCKET client, std::string correlationId,
                          std::string dur_str, std::string cam, std::string audio,
                          std::mutex &socketMutex);

    void handleStreamCam(SOCKET client, const std::string &clientIP, const std::string &cam, const std::string &audio);

private:
    static std::string G_DEVICE_LIST_JSON;
    static std::mutex G_DEVICE_LIST_MUTEX;
    static std::atomic<bool> G_IS_REFRESHING;

    // === QUAN LY STREAM & RECORD ===
    static std::vector<SOCKET> viewingClients;
    static std::vector<RecordingSession *> recordingSessions; // Danh sach cac may dang quay
    static std::mutex streamMutex;                            // Khoa chung cho ca Viewer va Recorder
    static std::atomic<bool> isStreaming;

    static void broadcastWorker(std::string cam, std::string audio);
    static void processFinishedSession(RecordingSession *session); // Helper convert file
};

#endif // DEVICECONTROLLER_H