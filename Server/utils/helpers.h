// utils/helpers.h (PHIEN BAN HYBRID)
#ifndef HELPERS_H
#define HELPERS_H

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <gdiplus.h>
#include <iphlpapi.h>
#include <psapi.h>
#include <string>
#include <vector>
#include <sstream>
#include <mutex> // Them include nay

// --- Socket Helpers ---
bool sendTcp(SOCKET s, const std::string &data);                                                               // Ham cu (cho stream)
bool sendCmdTcp(SOCKET s, const std::string &correlationId, const std::string &data, std::mutex &socketMutex); // Ham moi
bool sendStreamFrame(SOCKET s, const std::string &data);

// --- String Helpers ---
std::string jsonEscape(const std::string &s);
std::vector<std::string> splitArgs(const std::string &s);
std::string Base64Encode(const std::string &data);
std::string readBinaryFile(const std::string &filename);

// --- System Helpers ---
std::string exec(const char *cmd);
std::vector<std::string> getLocalIPv4Addresses();
std::string getProcessPath(DWORD pid);

// --- GDI+ Helpers ---
int GetEncoderClsid(const WCHAR *format, CLSID *pClsid);

#endif // HELPERS_H