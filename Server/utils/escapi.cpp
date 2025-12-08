#include <windows.h>
#include "escapi.h"

countCaptureDevicesProc countCaptureDevices;
initCaptureProc initCapture;
deinitCaptureProc deinitCapture;
doCaptureProc doCapture;
isCaptureDoneProc isCaptureDone;
getCaptureDeviceNameProc getCaptureDeviceName;
ESCAPIVersionProc ESCAPIVersion;

int setupESCAPI()
{
    HMODULE capdll = LoadLibraryA("escapi.dll");
    if (capdll == NULL)
        return 0;
    countCaptureDevices = (countCaptureDevicesProc)GetProcAddress(capdll, "countCaptureDevices");
    initCapture = (initCaptureProc)GetProcAddress(capdll, "initCapture");
    deinitCapture = (deinitCaptureProc)GetProcAddress(capdll, "deinitCapture");
    doCapture = (doCaptureProc)GetProcAddress(capdll, "doCapture");
    isCaptureDone = (isCaptureDoneProc)GetProcAddress(capdll, "isCaptureDone");
    getCaptureDeviceName = (getCaptureDeviceNameProc)GetProcAddress(capdll, "getCaptureDeviceName");
    ESCAPIVersion = (ESCAPIVersionProc)GetProcAddress(capdll, "ESCAPIVersion");
    if (countCaptureDevices == 0 || initCapture == 0 || deinitCapture == 0 || doCapture == 0 || isCaptureDone == 0 || getCaptureDeviceName == 0 || ESCAPIVersion == 0)
        return 0;
    return 1;
}