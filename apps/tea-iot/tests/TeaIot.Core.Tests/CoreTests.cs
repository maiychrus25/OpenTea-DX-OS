// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Text.Json;
using TeaIot.Core;

namespace TeaIot.Core.Tests;

public class ReadingTests
{
    [Fact]
    public void Topic_and_payload_follow_the_core_contract()
    {
        var r = new Reading("TC", "TC-A3", SensorKind.SoilMoisture, new DateTimeOffset(2026, 11, 24, 8, 0, 0, TimeSpan.FromHours(7)), 41.237);
        Assert.Equal("htx/TC/plot/TC-A3/soil_moisture", r.Topic);
        using var json = JsonDocument.Parse(r.Payload);
        Assert.Equal("2026-11-24T08:00:00+07:00", json.RootElement.GetProperty("ts").GetString());
        Assert.Equal(41.24, json.RootElement.GetProperty("value").GetDouble());
    }

    [Theory]
    [InlineData(SensorKind.SoilMoisture, 100, true)]
    [InlineData(SensorKind.SoilMoisture, 100.1, false)]
    [InlineData(SensorKind.AirTemperature, -10, true)]
    [InlineData(SensorKind.AirTemperature, 56, false)]
    [InlineData(SensorKind.Rainfall, double.NaN, false)]
    public void Ranges_match_the_ingest_worker(SensorKind kind, double value, bool ok) => Assert.Equal(ok, Sensors.InRange(kind, value));

    [Theory]
    [InlineData("TC", true)]
    [InlineData("T/C", false)]
    [InlineData("", false)]
    public void Htx_codes_cannot_break_the_topic(string code, bool ok) => Assert.Equal(ok, Codes.IsValidHtx(code));
}

public class SimulationTests
{
    private static StationModel Run(Scenario scenario, int hours)
    {
        var m = new StationModel(new StationConfig { ParcelCode = "TC-A3" }, seed: 7) { Scenario = scenario };
        var t = new DateTime(2026, 11, 24, 6, 0, 0);
        for (var i = 0; i < hours * 6; i++) m.Step(t = t.AddMinutes(10), 10);
        return m;
    }

    [Fact]
    public void Drought_dries_the_soil_and_rain_wets_it()
    {
        var dry = Run(Scenario.HeatDrought, 24);
        var wet = Run(Scenario.HeavyRain, 24);
        Assert.True(dry.SoilMoisture < 40, $"soil {dry.SoilMoisture}");
        Assert.True(wet.SoilMoisture > dry.SoilMoisture + 20);
    }

    [Fact]
    public void Normal_readings_stay_inside_the_valid_ranges()
    {
        var m = Run(Scenario.Normal, 48);
        Assert.All(m.Readings(), r => Assert.True(Sensors.InRange(r.Sensor, r.Value), $"{r.Sensor}={r.Value}"));
    }

    [Fact]
    public void Faulty_sensor_sends_values_the_core_rejects()
    {
        var m = Run(Scenario.FaultySensor, 1);
        Assert.Contains(m.Readings(), r => !Sensors.InRange(r.Sensor, r.Value));
    }

    [Fact]
    public void Irrigation_raises_soil_moisture()
    {
        var m = Run(Scenario.HeatDrought, 12);
        var before = m.SoilMoisture;
        m.Irrigate();
        Assert.True(m.SoilMoisture > before + 20);
    }
}

public class AlertTests
{
    private static readonly StationConfig Station = new() { ParcelCode = "TC-B1", Name = "Đồi B1", DryThreshold = 35 };
    private static readonly DateTime Now = new(2026, 11, 24, 10, 0, 0);

    [Fact]
    public void Dry_soil_suggests_watering_with_the_evidence()
    {
        var a = Assert.Single(AlertRules.Evaluate(Station, new Dictionary<SensorKind, double> { [SensorKind.SoilMoisture] = 28 }, Now));
        Assert.Equal(AlertKind.DrySoil, a.Kind);
        Assert.Equal("Tưới giữ ẩm Đồi B1", a.SuggestedTask);
        Assert.Contains("28", a.Evidence);
    }

    [Fact]
    public void Out_of_range_value_is_a_sensor_fault_not_dry_soil()
    {
        var a = Assert.Single(AlertRules.Evaluate(Station, new Dictionary<SensorKind, double> { [SensorKind.SoilMoisture] = 150 }, Now));
        Assert.Equal(AlertKind.SensorFault, a.Kind);
    }

    [Fact]
    public void Throttle_repeats_an_alert_only_after_the_cooldown()
    {
        var t = new AlertThrottle();
        var a = new Alert(AlertKind.DrySoil, AlertLevel.Warning, "TC-B1", "Đồi B1", "", "", null, Now);
        Assert.True(t.ShouldRaise(a));
        Assert.False(t.ShouldRaise(a with { At = Now.AddMinutes(10) }));
        Assert.True(t.ShouldRaise(a with { At = Now.AddMinutes(31) }));
    }
}

public class OutboxTests
{
    private sealed class FakeSink : IReadingSink
    {
        public bool IsConnected { get; set; }
        public List<Reading> Got { get; } = [];
        public Task<bool> PublishAsync(Reading reading, CancellationToken ct = default)
        {
            if (!IsConnected) return Task.FromResult(false);
            Got.Add(reading);
            return Task.FromResult(true);
        }
    }

    private static Reading R(int i) => new("TC", "TC-A3", SensorKind.Rainfall, DateTimeOffset.UnixEpoch.AddMinutes(i), i);

    [Fact]
    public async Task Readings_wait_while_offline_and_go_out_in_order()
    {
        var sink = new FakeSink();
        var box = new Outbox(sink);
        box.Enqueue([R(1), R(2), R(3)]);
        Assert.Equal(0, await box.FlushAsync());
        Assert.Equal(3, box.Pending);
        sink.IsConnected = true;
        Assert.Equal(3, await box.FlushAsync());
        Assert.Equal([1, 2, 3], sink.Got.Select(g => (int)g.Value));
        Assert.Equal(0, box.Pending);
    }

    [Fact]
    public void Oldest_readings_are_dropped_past_capacity()
    {
        var box = new Outbox(new FakeSink(), capacity: 2);
        box.Enqueue([R(1), R(2), R(3)]);
        Assert.Equal(2, box.Pending);
        Assert.Equal(1, box.Dropped);
    }
}
