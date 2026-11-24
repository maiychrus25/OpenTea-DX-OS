// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Text;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;
using TeaIot.Core;

namespace TeaIot.App.Services;

/// <summary>Publishes readings to the DX-OS Mosquitto broker with QoS 1 (at least once).</summary>
public sealed class MqttSink : IReadingSink, IAsyncDisposable
{
    private readonly IMqttClient _client = new MqttFactory().CreateMqttClient();

    public bool IsConnected => _client.IsConnected;
    public string? LastError { get; private set; }

    public event EventHandler? StateChanged;

    public MqttSink()
    {
        _client.DisconnectedAsync += e =>
        {
            if (e.ClientWasConnected) LastError = e.Reason == MqttClientDisconnectReason.NormalDisconnection ? null : $"Mất kết nối: {e.Reason}";
            StateChanged?.Invoke(this, EventArgs.Empty);
            return Task.CompletedTask;
        };
        _client.ConnectedAsync += _ =>
        {
            LastError = null;
            StateChanged?.Invoke(this, EventArgs.Empty);
            return Task.CompletedTask;
        };
    }

    public async Task<bool> ConnectAsync(IotConfig config, CancellationToken ct = default)
    {
        if (_client.IsConnected) return true;
        var options = new MqttClientOptionsBuilder()
            .WithTcpServer(config.BrokerHost, config.BrokerPort)
            .WithCredentials(config.HtxCode, config.BrokerPassword)
            .WithClientId($"tea-iot-{config.HtxCode}-{Environment.MachineName}".ToLowerInvariant())
            .WithCleanSession(true)
            .WithTimeout(TimeSpan.FromSeconds(5))
            .WithProtocolVersion(MQTTnet.Formatter.MqttProtocolVersion.V311)
            .Build();
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(6));
            var result = await _client.ConnectAsync(options, timeout.Token);
            if (result.ResultCode != MqttClientConnectResultCode.Success)
            {
                LastError = result.ResultCode switch
                {
                    MqttClientConnectResultCode.BadUserNameOrPassword or MqttClientConnectResultCode.NotAuthorized
                        => "Sai tài khoản thiết bị (mã HTX hoặc mật khẩu MQTT).",
                    _ => $"Broker từ chối: {result.ResultCode}",
                };
                return false;
            }
            return true;
        }
        catch (Exception e) when (e is MQTTnet.Exceptions.MqttCommunicationException or OperationCanceledException or MQTTnet.Adapter.MqttConnectingFailedException)
        {
            LastError = e is MQTTnet.Adapter.MqttConnectingFailedException { ResultCode: MqttClientConnectResultCode.BadUserNameOrPassword or MqttClientConnectResultCode.NotAuthorized }
                ? "Sai tài khoản thiết bị (mã HTX hoặc mật khẩu MQTT)."
                : $"Không kết nối được {config.BrokerHost}:{config.BrokerPort}. Lõi DX-OS đã chạy và đã mở cổng MQTT chưa?";
            return false;
        }
    }

    public async Task DisconnectAsync()
    {
        if (_client.IsConnected) await _client.DisconnectAsync();
    }

    public async Task<bool> PublishAsync(Reading reading, CancellationToken ct = default)
    {
        if (!_client.IsConnected) return false;
        var message = new MqttApplicationMessageBuilder()
            .WithTopic(reading.Topic)
            .WithPayload(Encoding.UTF8.GetBytes(reading.Payload))
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .Build();
        try
        {
            var result = await _client.PublishAsync(message, ct);
            if (result.IsSuccess) return true;
            LastError = $"Broker không nhận bản tin: {result.ReasonCode}";
            return false;
        }
        catch (Exception e) when (e is MQTTnet.Exceptions.MqttCommunicationException or OperationCanceledException or MQTTnet.Exceptions.MqttClientNotConnectedException)
        {
            LastError = "Gửi lỗi, bản tin được giữ lại để gửi sau.";
            return false;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync();
        _client.Dispose();
    }
}
