#pragma once
struct SimpleCapParams
{
    int *mTargetBuf; // Must be at least mWidth * mHeight * sizeof(int)
    int mWidth;
    int mHeight;
};
typedef int (*countCaptureDevicesProc)();
typedef void (*initCaptureProc)(unsigned int deviceno, SimpleCapParams *aParams);
typedef void (*deinitCaptureProc)(unsigned int deviceno);
typedef void (*doCaptureProc)(unsigned int deviceno);
typedef int (*isCaptureDoneProc)(unsigned int deviceno);
typedef void (*getCaptureDeviceNameProc)(unsigned int deviceno, char *namebuffer, int bufferlength);
typedef void (*ESCAPIVersionProc)(unsigned int *user);

extern countCaptureDevicesProc countCaptureDevices;
extern initCaptureProc initCapture;
extern deinitCaptureProc deinitCapture;
extern doCaptureProc doCapture;
extern isCaptureDoneProc isCaptureDone;
extern getCaptureDeviceNameProc getCaptureDeviceName;
extern ESCAPIVersionProc ESCAPIVersion;

int setupESCAPI(); // Return 0 on failure, 1 on success