import pytest


CSV_TEXT = '''Symbol,Status,MarketOrFill,Price,TIF,Time,TimeStampAtType,Order #,Description
SPX,Filled,1.50 cr,1.50 cr,Day,"8/12, 8:13a",Fill,#OPEN-1,"-1 Aug 12 Exp 7755 Call STO
1 Aug 12 Exp 7760 Call BTO"
SPX,Filled,0.90 db,0.90 db,GTC,"8/12, 8:40a",Fill,#CLOSE-1,"1 Aug 12 Exp 7755 Call BTC
-1 Aug 12 Exp 7760 Call STC"
SPX,Canceled,1.20 cr,1.20 cr,Day,"8/12, 9:00a",Canceled,#IGNORED,"-1 Aug 12 Exp 7780 Call STO
1 Aug 12 Exp 7785 Call BTO"
'''


@pytest.mark.asyncio
async def test_tasty_activity_csv_import_is_idempotent_and_lists_zero_dte(client):
    request = {"csv_text": CSV_TEXT, "as_of_date": "2026-08-16"}

    first = await client.post("/v1/broker/activity-imports/tastytrade-csv", json=request)
    second = await client.post("/v1/broker/activity-imports/tastytrade-csv", json=request)

    assert first.status_code == 200
    assert first.json()["schema_version"] == "imported-spread-trades.v1"
    assert first.json()["source_rows"] == 3
    assert first.json()["filled_orders"] == 2
    assert first.json()["paired_positions"] == 1
    assert first.json()["imported"] == 1
    assert first.json()["existing"] == 0
    trade = first.json()["trades"][0]
    assert trade["strategy"] == "bear_call_credit"
    assert trade["zero_dte"] is True
    assert trade["width"] == 5
    assert trade["gross_pnl_dollars"] == 60
    assert trade["holding_minutes"] == 27

    assert second.status_code == 200
    assert second.json()["imported"] == 0
    assert second.json()["existing"] == 1

    listing = await client.get(
        "/v1/broker/imported-spread-trades",
        params={"start_date": "2026-08-12", "end_date": "2026-08-12", "zero_dte_only": "true"},
    )
    assert listing.status_code == 200
    assert listing.json()["schema_version"] == "imported-spread-trades.v1"
    assert any(row["entry_order_id"] == "OPEN-1" for row in listing.json()["rows"])


@pytest.mark.asyncio
async def test_tasty_activity_csv_import_rejects_unknown_shape(client):
    response = await client.post(
        "/v1/broker/activity-imports/tastytrade-csv",
        json={"csv_text": "Symbol,Status\nSPX,Filled\n", "as_of_date": "2026-08-16"},
    )

    assert response.status_code == 422
    assert "Missing required" in response.json()["detail"]
