// controllers/ProcessController.cpp
#include "../utils/helpers.h" // Can jsonEscape
#include "ProcessController.h"
#include <sstream>
#include <tlhelp32.h> // cho listProcessesJson
#include <stdexcept>  // cho stoi

using namespace std;

/**
 * @brief Liet ke tat ca tien trinh (process) dang chay thanh chuoi JSON.
 */
string ProcessController::listProcessesJson()
{
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    PROCESSENTRY32 pe;
    pe.dwSize = sizeof(PROCESSENTRY32);
    stringstream ss;
    ss << "[";
    if (Process32First(snap, &pe))
    {
        bool first = true;
        do
        {
            if (!first)
                ss << ",";
            first = false;
            ss << "{\"pid\":" << pe.th32ProcessID << ",\"exe\":\"" << jsonEscape(pe.szExeFile) << "\"}";
        } while (Process32Next(snap, &pe));
    }
    CloseHandle(snap);
    ss << "]";
    return ss.str();
}

/**
 * @brief "Giet" mot tien trinh bang ma PID cua no.
 */
bool ProcessController::killProcessByPid(DWORD pid)
{
    HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
    if (!h)
        return false;
    BOOL ok = TerminateProcess(h, 1);
    CloseHandle(h);
    return ok;
}
// --- Public Handlers (Tra ve JSON string) ---
string ProcessController::getProcessesJson()
{
    return listProcessesJson();
}

string ProcessController::killProcess(const string &pid_str)
{
    try
    {
        DWORD id = stoul(pid_str); // stoul = string to unsigned long
        bool ok = killProcessByPid(id);
        return ok ? "{\"ok\":true}" : "{\"ok\":false}";
    }
    catch (...)
    {
        return "{\"ok\":false, \"error\":\"Invalid PID\"}";
    }
}