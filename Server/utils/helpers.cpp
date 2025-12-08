// utils/helpers.cpp (FINAL: FIX ANSI to UTF-8 for Vietnamese)
#include "helpers.h"
#include <fstream>
#include <array>
#include <stdexcept>
#include <shlwapi.h>
#include <cstdint>
#include <mutex>
#include <iomanip>
#include <sstream>
#include <vector> // Can thiet cho vector

using namespace Gdiplus;
using namespace std;

// === HAM CHUYEN DOI: ANSI (Windows) -> UTF-8 (Web) ===
std::string AnsiToUtf8(const std::string &ansi)
{
    if (ansi.empty())
        return "";

    // 1. Hoi do dai can thiet de chuyen sang Unicode (Wide Char)
    int targetLen = MultiByteToWideChar(CP_ACP, 0, ansi.c_str(), -1, NULL, 0);
    if (targetLen == 0)
        return ansi;

    // 2. Chuyen sang Unicode
    std::vector<wchar_t> wstr(targetLen);
    MultiByteToWideChar(CP_ACP, 0, ansi.c_str(), -1, &wstr[0], targetLen);

    // 3. Hoi do dai can thiet de chuyen tu Unicode sang UTF-8
    int targetLen8 = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], -1, NULL, 0, NULL, NULL);
    if (targetLen8 == 0)
        return ansi;

    // 4. Chuyen sang UTF-8
    std::vector<char> str8(targetLen8);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], -1, &str8[0], targetLen8, NULL, NULL);

    return std::string(&str8[0]);
}

bool sendAll(SOCKET s, const char *data, int totalBytes)
{
    int bytesSent = 0;
    while (bytesSent < totalBytes)
    {
        int ret = send(s, data + bytesSent, totalBytes - bytesSent, 0);
        if (ret == SOCKET_ERROR)
            return false;
        bytesSent += ret;
    }
    return true;
}

bool sendCmdTcp(SOCKET s, const std::string &correlationId, const std::string &data, std::mutex &socketMutex)
{
    std::lock_guard<std::mutex> lock(socketMutex);

    // 1. Ma hoa toan bo du lieu (bao gom ca chu "JSON ...") sang Base64
    // Dieu nay dam bao khong co ky tu xuong dong hay ky tu la nao lam hong goi tin
    std::string b64Data = Base64Encode(data);

    // 2. Gui goi tin voi tien to "B64:" de Gateway nhan biet
    std::string msg = correlationId + "|B64:" + b64Data + "\n";

    return sendAll(s, msg.c_str(), (int)msg.length());
}

bool sendStreamFrame(SOCKET s, const std::string &data)
{
    uint32_t len = (uint32_t)data.size();
    if (!sendAll(s, (const char *)&len, 4))
        return false;
    if (!sendAll(s, data.c_str(), (int)len))
        return false;
    return true;
}

// === HAM NAY DA DUOC CAP NHAT DE TU DONG CHUYEN UTF-8 ===
std::string jsonEscape(const std::string &raw)
{
    // BUOC 1: Chuyen toan bo chuoi dau vao sang UTF-8 truoc
    std::string s = AnsiToUtf8(raw);

    // BUOC 2: Escape cac ky tu dac biet cua JSON
    std::ostringstream o;
    for (char c : s)
    {
        switch (c)
        {
        case '"':
            o << "\\\"";
            break;
        case '\\':
            o << "\\\\";
            break;
        case '\b':
            o << "\\b";
            break;
        case '\f':
            o << "\\f";
            break;
        case '\n':
            o << "\\n";
            break;
        case '\r':
            o << "\\r";
            break;
        case '\t':
            o << "\\t";
            break;
        default:
            if ((unsigned char)c < '\x20')
            {
                o << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (int)((unsigned char)c);
            }
            else
            {
                o << c;
            }
        }
    }
    return o.str();
}

std::string Base64Encode(const std::string &data)
{
    static const char *base64_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string ret;
    int i = 0, j = 0;
    unsigned char char_array_3[3], char_array_4[4];
    const unsigned char *bytes_to_encode = (const unsigned char *)data.c_str();
    int in_len = data.length();
    while (in_len--)
    {
        char_array_3[i++] = *(bytes_to_encode++);
        if (i == 3)
        {
            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
            char_array_4[3] = char_array_3[2] & 0x3f;
            for (i = 0; (i < 4); i++)
                ret += base64_chars[char_array_4[i]];
            i = 0;
        }
    }
    if (i)
    {
        for (j = i; j < 3; j++)
            char_array_3[j] = '\0';
        char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
        char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
        char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
        char_array_4[3] = char_array_3[2] & 0x3f;
        for (j = 0; (j < i + 1); j++)
            ret += base64_chars[char_array_4[j]];
        while ((i++ < 3))
            ret += '=';
    }
    return ret;
}

std::vector<std::string> splitArgs(const std::string &s)
{
    std::vector<std::string> result;
    std::string current_arg;
    bool in_quote = false;
    for (size_t i = 0; i < s.length(); ++i)
    {
        char c = s[i];
        if (c == '"')
        {
            in_quote = !in_quote;
            if (in_quote && current_arg.empty())
                continue;
            if (!in_quote)
            {
                result.push_back(current_arg);
                current_arg = "";
            }
        }
        else if (c == ' ' && !in_quote)
        {
            if (!current_arg.empty())
            {
                result.push_back(current_arg);
                current_arg = "";
            }
        }
        else
        {
            current_arg += c;
        }
    }
    if (!current_arg.empty())
        result.push_back(current_arg);
    return result;
}

std::string exec(const char *cmd)
{
    std::array<char, 128> buffer;
    std::string result;
    FILE *pipe = _popen(cmd, "r");
    if (!pipe)
        return "ERROR";
    while (fgets(buffer.data(), buffer.size(), pipe) != nullptr)
        result += buffer.data();
    _pclose(pipe);
    return result;
}

std::string readBinaryFile(const std::string &filename)
{
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    if (!file)
        return "";
    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::string buffer(size, '\0');
    if (file.read(&buffer[0], size))
        return buffer;
    return "";
}

std::vector<std::string> getLocalIPv4Addresses()
{
    std::vector<std::string> res;
    ULONG len = 15000;
    PIP_ADAPTER_ADDRESSES pAddrs = (PIP_ADAPTER_ADDRESSES)malloc(len);
    if (GetAdaptersAddresses(AF_INET, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER, NULL, pAddrs, &len) == NO_ERROR)
    {
        for (PIP_ADAPTER_ADDRESSES cur = pAddrs; cur; cur = cur->Next)
        {
            if (cur->OperStatus == IfOperStatusUp)
            {
                for (PIP_ADAPTER_UNICAST_ADDRESS ua = cur->FirstUnicastAddress; ua; ua = ua->Next)
                {
                    if (ua->Address.lpSockaddr->sa_family == AF_INET)
                    {
                        char buf[128];
                        inet_ntop(AF_INET, &((sockaddr_in *)ua->Address.lpSockaddr)->sin_addr, buf, sizeof(buf));
                        std::string s(buf);
                        if (s != "127.0.0.1" && !s.empty())
                            res.push_back(s);
                    }
                }
            }
        }
    }
    free(pAddrs);
    return res;
}

std::string getProcessPath(DWORD pid)
{
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (!hProcess)
        return "";
    char path[MAX_PATH];
    if (GetModuleFileNameExA(hProcess, NULL, path, MAX_PATH) == 0)
    {
        DWORD size = MAX_PATH;
        QueryFullProcessImageNameA(hProcess, 0, path, &size);
    }
    CloseHandle(hProcess);
    return std::string(path);
}

int GetEncoderClsid(const WCHAR *format, CLSID *pClsid)
{
    UINT num = 0, size = 0;
    GetImageEncodersSize(&num, &size);
    if (size == 0)
        return -1;
    ImageCodecInfo *p = (ImageCodecInfo *)(malloc(size));
    GetImageEncoders(num, size, p);
    for (UINT j = 0; j < num; ++j)
    {
        if (wcscmp(p[j].MimeType, format) == 0)
        {
            *pClsid = p[j].Clsid;
            free(p);
            return j;
        }
    }
    free(p);
    return -1;
}