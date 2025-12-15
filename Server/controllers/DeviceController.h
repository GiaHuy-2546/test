// controllers/DeviceController.h
#ifndef DEVICECONTROLLER_H
#define DEVICECONTROLLER_H

#include <winsock2.h>
#include <windows.h>  // Can cho HWND
#include <mmsystem.h> // Can cho WaveIn
#include <string>
#include <mutex>
#include <atomic>
#include <vector>

#pragma comment(lib, "winmm.lib")

class DeviceController
{
public:
    static void buildDeviceListJson();
    std::string getDevices(bool refresh = false);

    // Chi con ham xu ly Stream
    void handleStreamCam(SOCKET client, const std::string &clientIP, const std::string &cam, const std::string &audio);

private:

    std::vector<std::string> getAudioDevices();

    static std::string G_DEVICE_LIST_JSON;
    static std::mutex G_DEVICE_LIST_MUTEX;
    static std::atomic<bool> G_IS_REFRESHING;

    static std::vector<SOCKET> viewingClients;
    static std::mutex streamMutex;
    static std::atomic<bool> isStreaming;

    // Worker chạy ngầm
    void broadcastWorker(std::string camName, std::string audioName);

    static HWAVEIN hWaveIn;
    static WAVEHDR waveHeaders[3];     // Dùng 3 bộ đệm để ghi âm liên tục
    static char audioBuffers[3][1024]; // Mỗi buffer khoảng 2KB (~200ms âm thanh)

    // Hàm khởi động/dừng ghi âm
    void startAudioCapture(int devID);
    void stopAudioCapture();

    // Hàm callback khi Windows thu xong 1 gói âm thanh
    static void CALLBACK AudioCallback(HWAVEIN hwi, UINT uMsg, DWORD_PTR dwInstance, DWORD_PTR dwParam1, DWORD_PTR dwParam2);
};

#endif // DEVICECONTROLLER_H