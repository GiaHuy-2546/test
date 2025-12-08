// controllers/DeviceController.h
#ifndef DEVICECONTROLLER_H
#define DEVICECONTROLLER_H

#include <winsock2.h>
#include <string>
#include <mutex>
#include <atomic>
#include <vector>

class DeviceController
{
public:
    static void buildDeviceListJson();
    std::string getDevices(bool refresh = false);

    // Chi con ham xu ly Stream
    void handleStreamCam(SOCKET client, const std::string &clientIP, const std::string &cam, const std::string &audio);

private:
    static std::string G_DEVICE_LIST_JSON;
    static std::mutex G_DEVICE_LIST_MUTEX;
    static std::atomic<bool> G_IS_REFRESHING;

    static std::vector<SOCKET> viewingClients;
    static std::mutex streamMutex;
    static std::atomic<bool> isStreaming;

    // Worker chay ngam
    void broadcastWorker(std::string camName);
};

#endif // DEVICECONTROLLER_H