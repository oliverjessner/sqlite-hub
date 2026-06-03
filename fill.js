import Database from 'better-sqlite3';

const DB_PATH = '/Users/oli/database/project_trump/trump.sqlite';
const POLYGON_API_KEY = 'j6q5v6iWfVGettyfUxMllrfqg9E9iweT';
const LIMIT = 1;
const CALLS_PER_WINDOW = 5;
const RATE_LIMIT_SLEEP_MS = 61_000;

if (!POLYGON_API_KEY) {
    throw new Error(
        "POLYGON_API_KEY fehlt. Starte z.B. mit: POLYGON_API_KEY='dein_key' DB_PATH='./deine-db.sqlite' node fill-mention-impact-prices-all.mjs",
    );
}

const db = new Database(DB_PATH);

let polygonCallCounter = 0;
const polygonCache = new Map();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeUnixSeconds(value) {
    if (value == null) return null;

    const raw = String(value).trim();

    // Format: YYYYMMDD, z.B. 20250121
    // Da wir keine genaue Uhrzeit haben, nehmen wir US-Markteröffnung 09:30 New York.
    // Für Januar ist das 14:30 UTC. Für einen ersten Lauf reicht das.
    if (/^\d{8}$/.test(raw)) {
        const year = Number(raw.slice(0, 4));
        const month = Number(raw.slice(4, 6));
        const day = Number(raw.slice(6, 8));

        return Math.floor(Date.UTC(year, month - 1, day, 14, 30, 0) / 1000);
    }

    // Format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [year, month, day] = raw.split('-').map(Number);

        return Math.floor(Date.UTC(year, month - 1, day, 14, 30, 0) / 1000);
    }

    const n = Number(value);
    if (!Number.isFinite(n)) return null;

    // Millisekunden-Timestamp
    if (n > 1_000_000_000_000) {
        return Math.floor(n / 1000);
    }

    // Unix-Sekunden
    return Math.floor(n);
}

function dateStringFromUnixSeconds(unixSeconds, offsetDays = 0) {
    const ms = unixSeconds * 1000 + offsetDays * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
}

function etDateKey(ms) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(ms));

    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

function normalizePolygonSymbol(symbol) {
    if (!symbol) return null;

    const clean = String(symbol).trim();

    const map = {
        '^IXIC': 'I:COMP',
        '^GSPC': 'I:SPX',
        '^DJI': 'I:DJI',
        '^NDX': 'I:NDX',
    };

    return map[clean] || clean;
}

async function waitIfRateLimitWindowHit() {
    if (polygonCallCounter > 0 && polygonCallCounter % CALLS_PER_WINDOW === 0) {
        console.log(`Rate-Limit-Pause nach ${polygonCallCounter} Polygon-Calls: ${RATE_LIMIT_SLEEP_MS / 1000}s`);
        await sleep(RATE_LIMIT_SLEEP_MS);
    }
}

async function fetchPolygonJson(url, label) {
    polygonCallCounter += 1;

    console.log(`Polygon call #${polygonCallCounter}: ${label}`);

    const res = await fetch(url);
    const text = await res.text();

    await waitIfRateLimitWindowHit();

    if (res.status === 429) {
        console.warn('Polygon 429 Rate Limit. Warte 61 Sekunden und versuche es nochmal...');
        await sleep(RATE_LIMIT_SLEEP_MS);
        return fetchPolygonJson(url, `${label} retry`);
    }

    if (!res.ok) {
        throw new Error(`Polygon HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    let json;

    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`Polygon response ist kein JSON: ${text.slice(0, 500)}`);
    }

    if (json.status === 'ERROR') {
        throw new Error(`Polygon ERROR: ${json.error || JSON.stringify(json).slice(0, 500)}`);
    }

    return json;
}

async function polygonAggs(symbol, multiplier, timespan, from, to) {
    const polygonSymbol = normalizePolygonSymbol(symbol);

    if (!polygonSymbol) {
        throw new Error('Kein Symbol vorhanden.');
    }

    const cacheKey = [polygonSymbol, multiplier, timespan, from, to].join('|');

    if (polygonCache.has(cacheKey)) {
        console.log(`Cache hit: ${cacheKey}`);
        return polygonCache.get(cacheKey);
    }

    const url = new URL(
        `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(polygonSymbol)}/range/${multiplier}/${timespan}/${from}/${to}`,
    );

    url.searchParams.set('adjusted', 'true');
    url.searchParams.set('sort', 'asc');
    url.searchParams.set('limit', '50000');
    url.searchParams.set('apiKey', POLYGON_API_KEY);

    const json = await fetchPolygonJson(url, `${polygonSymbol} ${multiplier}/${timespan} ${from} -> ${to}`);

    const bars = (json.results || [])
        .filter(row => row && Number.isFinite(row.t) && Number.isFinite(row.c))
        .map(row => ({
            t: row.t,
            open: row.o,
            high: row.h,
            low: row.l,
            close: row.c,
            volume: row.v,
        }))
        .sort((a, b) => a.t - b.t);

    polygonCache.set(cacheKey, bars);

    return bars;
}

function firstBarAtOrAfter(bars, targetMs) {
    return bars.find(bar => bar.t >= targetMs && Number.isFinite(bar.close)) || null;
}

function eodCloseForSession(intradayBars, sessionDateKey) {
    const sessionBars = intradayBars.filter(bar => etDateKey(bar.t) === sessionDateKey);

    if (sessionBars.length === 0) {
        return null;
    }

    return sessionBars[sessionBars.length - 1].close;
}

function dailyRows(dailyBars) {
    return dailyBars
        .filter(bar => Number.isFinite(bar.close))
        .map(bar => ({
            t: bar.t,
            dateKey: etDateKey(bar.t),
            close: bar.close,
        }))
        .sort((a, b) => a.t - b.t);
}

function pickPrices(intradayBars, dailyBars, eventUnixSeconds) {
    const eventMs = eventUnixSeconds * 1000;

    const atEventBar = firstBarAtOrAfter(intradayBars, eventMs);

    if (!atEventBar) {
        return {
            price_at_event: null,
            price_1h: null,
            price_eod: null,
            price_next_trading_day_1: null,
            price_next_trading_day_2: null,
            price_next_trading_day_3: null,
            price_next_trading_day_5: null,
        };
    }

    const oneHourBar = firstBarAtOrAfter(intradayBars, atEventBar.t + 60 * 60 * 1000);

    const baseSessionDateKey = etDateKey(atEventBar.t);
    const eod = eodCloseForSession(intradayBars, baseSessionDateKey);

    const days = dailyRows(dailyBars);

    let baseDayIndex = days.findIndex(day => day.dateKey === baseSessionDateKey);

    if (baseDayIndex === -1) {
        baseDayIndex = days.findIndex(day => day.t >= atEventBar.t);
    }

    function nextTradingDayClose(n) {
        if (baseDayIndex === -1) return null;
        const row = days[baseDayIndex + n];
        return row ? row.close : null;
    }

    return {
        price_at_event: atEventBar.close,
        price_1h: oneHourBar ? oneHourBar.close : null,
        price_eod: eod,
        price_next_trading_day_1: nextTradingDayClose(1),
        price_next_trading_day_2: nextTradingDayClose(2),
        price_next_trading_day_3: nextTradingDayClose(3),
        price_next_trading_day_5: nextTradingDayClose(5),
    };
}

function calcReturn(fromPrice, toPrice) {
    if (!Number.isFinite(fromPrice)) return null;
    if (!Number.isFinite(toPrice)) return null;
    if (fromPrice === 0) return null;

    return (toPrice - fromPrice) / fromPrice;
}

function calcReturns(prices) {
    return {
        return_1h: calcReturn(prices.price_at_event, prices.price_1h),
        return_eod: calcReturn(prices.price_at_event, prices.price_eod),
        return_next_trading_day_1: calcReturn(prices.price_at_event, prices.price_next_trading_day_1),
        return_next_trading_day_2: calcReturn(prices.price_at_event, prices.price_next_trading_day_2),
        return_next_trading_day_3: calcReturn(prices.price_at_event, prices.price_next_trading_day_3),
        return_next_trading_day_5: calcReturn(prices.price_at_event, prices.price_next_trading_day_5),
    };
}

function calcDelta(stockReturn, benchmarkReturn) {
    if (!Number.isFinite(stockReturn)) return null;
    if (!Number.isFinite(benchmarkReturn)) return null;

    return stockReturn - benchmarkReturn;
}

function completionStatus(stockPrices, benchmarkPrices) {
    const required = [
        stockPrices.price_at_event,
        stockPrices.price_1h,
        stockPrices.price_eod,
        stockPrices.price_next_trading_day_1,
        stockPrices.price_next_trading_day_2,
        stockPrices.price_next_trading_day_3,
        stockPrices.price_next_trading_day_5,

        benchmarkPrices.price_at_event,
        benchmarkPrices.price_1h,
        benchmarkPrices.price_eod,
        benchmarkPrices.price_next_trading_day_1,
        benchmarkPrices.price_next_trading_day_2,
        benchmarkPrices.price_next_trading_day_3,
        benchmarkPrices.price_next_trading_day_5,
    ];

    return required.every(Number.isFinite) ? 'complete' : 'partial';
}

const selectRows = db.prepare(`
  SELECT
    mi.id,
    mi.event_time,
    COALESCE(mi.benchmark_symbol, '^IXIC') AS benchmark_symbol,
    c.ticker AS stock_symbol,
    c.short_name AS company_name
  FROM mention_impact mi
  JOIN companies c
    ON c.id = mi.company_id
  WHERE mi.event_time IS NOT NULL
    AND c.ticker IS NOT NULL
    AND TRIM(c.ticker) != ''
    AND (
      mi.price_at_event IS NULL
      OR mi.benchmark_price_at_event IS NULL
      OR mi.status IN ('pending', 'failed')
    )
  ORDER BY mi.event_time ASC
`);

const updateRow = db.prepare(`
  UPDATE mention_impact
  SET
    price_at_event = @price_at_event,
    price_1h = @price_1h,
    price_eod = @price_eod,
    price_next_trading_day_1 = @price_next_trading_day_1,
    price_next_trading_day_2 = @price_next_trading_day_2,
    price_next_trading_day_3 = @price_next_trading_day_3,
    price_next_trading_day_5 = @price_next_trading_day_5,

    benchmark_price_at_event = @benchmark_price_at_event,
    benchmark_price_1h = @benchmark_price_1h,
    benchmark_price_eod = @benchmark_price_eod,
    benchmark_price_next_trading_day_1 = @benchmark_price_next_trading_day_1,
    benchmark_price_next_trading_day_2 = @benchmark_price_next_trading_day_2,
    benchmark_price_next_trading_day_3 = @benchmark_price_next_trading_day_3,
    benchmark_price_next_trading_day_5 = @benchmark_price_next_trading_day_5,

    stock_return_1h = @stock_return_1h,
    stock_return_eod = @stock_return_eod,
    stock_return_next_trading_day_1 = @stock_return_next_trading_day_1,
    stock_return_next_trading_day_2 = @stock_return_next_trading_day_2,
    stock_return_next_trading_day_3 = @stock_return_next_trading_day_3,
    stock_return_next_trading_day_5 = @stock_return_next_trading_day_5,

    benchmark_return_1h = @benchmark_return_1h,
    benchmark_return_eod = @benchmark_return_eod,
    benchmark_return_next_trading_day_1 = @benchmark_return_next_trading_day_1,
    benchmark_return_next_trading_day_2 = @benchmark_return_next_trading_day_2,
    benchmark_return_next_trading_day_3 = @benchmark_return_next_trading_day_3,
    benchmark_return_next_trading_day_5 = @benchmark_return_next_trading_day_5,

    delta_return_1h = @delta_return_1h,
    delta_return_eod = @delta_return_eod,
    delta_return_next_trading_day_1 = @delta_return_next_trading_day_1,
    delta_return_next_trading_day_2 = @delta_return_next_trading_day_2,
    delta_return_next_trading_day_3 = @delta_return_next_trading_day_3,
    delta_return_next_trading_day_5 = @delta_return_next_trading_day_5,

    status = @status,
    error_text = NULL,
    updated_at = unixepoch()
  WHERE id = @id
`);

const markFailed = db.prepare(`
  UPDATE mention_impact
  SET
    status = 'failed',
    error_text = @error_text,
    updated_at = unixepoch()
  WHERE id = @id
`);

async function fillOne(row) {
    const eventUnixSeconds = normalizeUnixSeconds(row.event_time);

    if (!eventUnixSeconds) {
        throw new Error('event_time ist leer oder ungültig.');
    }

    const stockSymbol = normalizePolygonSymbol(row.stock_symbol);
    const benchmarkSymbol = normalizePolygonSymbol(row.benchmark_symbol || '^IXIC');

    if (/^\d+$/.test(String(stockSymbol))) {
        throw new Error(
            `Ticker "${stockSymbol}" sieht nach einem nicht-US-Ticker aus. Polygon braucht ein handelbares Symbol wie AAPL, MSFT, TSLA oder ggf. ein ADR/OTC-Symbol.`,
        );
    }

    if (!stockSymbol) {
        throw new Error('Kein Aktien-Ticker in companies.ticker vorhanden.');
    }

    if (!benchmarkSymbol) {
        throw new Error('Kein Benchmark-Symbol vorhanden.');
    }

    const from = dateStringFromUnixSeconds(eventUnixSeconds, -3);
    const to = dateStringFromUnixSeconds(eventUnixSeconds, 14);

    const stockIntradayBars = await polygonAggs(stockSymbol, 5, 'minute', from, to);
    const stockDailyBars = await polygonAggs(stockSymbol, 1, 'day', from, to);

    const benchmarkIntradayBars = await polygonAggs(benchmarkSymbol, 5, 'minute', from, to);
    const benchmarkDailyBars = await polygonAggs(benchmarkSymbol, 1, 'day', from, to);

    const stockPrices = pickPrices(stockIntradayBars, stockDailyBars, eventUnixSeconds);
    const benchmarkPrices = pickPrices(benchmarkIntradayBars, benchmarkDailyBars, eventUnixSeconds);

    const stockReturns = calcReturns(stockPrices);
    const benchmarkReturns = calcReturns(benchmarkPrices);

    const payload = {
        id: row.id,

        price_at_event: stockPrices.price_at_event,
        price_1h: stockPrices.price_1h,
        price_eod: stockPrices.price_eod,
        price_next_trading_day_1: stockPrices.price_next_trading_day_1,
        price_next_trading_day_2: stockPrices.price_next_trading_day_2,
        price_next_trading_day_3: stockPrices.price_next_trading_day_3,
        price_next_trading_day_5: stockPrices.price_next_trading_day_5,

        benchmark_price_at_event: benchmarkPrices.price_at_event,
        benchmark_price_1h: benchmarkPrices.price_1h,
        benchmark_price_eod: benchmarkPrices.price_eod,
        benchmark_price_next_trading_day_1: benchmarkPrices.price_next_trading_day_1,
        benchmark_price_next_trading_day_2: benchmarkPrices.price_next_trading_day_2,
        benchmark_price_next_trading_day_3: benchmarkPrices.price_next_trading_day_3,
        benchmark_price_next_trading_day_5: benchmarkPrices.price_next_trading_day_5,

        stock_return_1h: stockReturns.return_1h,
        stock_return_eod: stockReturns.return_eod,
        stock_return_next_trading_day_1: stockReturns.return_next_trading_day_1,
        stock_return_next_trading_day_2: stockReturns.return_next_trading_day_2,
        stock_return_next_trading_day_3: stockReturns.return_next_trading_day_3,
        stock_return_next_trading_day_5: stockReturns.return_next_trading_day_5,

        benchmark_return_1h: benchmarkReturns.return_1h,
        benchmark_return_eod: benchmarkReturns.return_eod,
        benchmark_return_next_trading_day_1: benchmarkReturns.return_next_trading_day_1,
        benchmark_return_next_trading_day_2: benchmarkReturns.return_next_trading_day_2,
        benchmark_return_next_trading_day_3: benchmarkReturns.return_next_trading_day_3,
        benchmark_return_next_trading_day_5: benchmarkReturns.return_next_trading_day_5,

        delta_return_1h: calcDelta(stockReturns.return_1h, benchmarkReturns.return_1h),
        delta_return_eod: calcDelta(stockReturns.return_eod, benchmarkReturns.return_eod),

        delta_return_next_trading_day_1: calcDelta(
            stockReturns.return_next_trading_day_1,
            benchmarkReturns.return_next_trading_day_1,
        ),

        delta_return_next_trading_day_2: calcDelta(
            stockReturns.return_next_trading_day_2,
            benchmarkReturns.return_next_trading_day_2,
        ),

        delta_return_next_trading_day_3: calcDelta(
            stockReturns.return_next_trading_day_3,
            benchmarkReturns.return_next_trading_day_3,
        ),

        delta_return_next_trading_day_5: calcDelta(
            stockReturns.return_next_trading_day_5,
            benchmarkReturns.return_next_trading_day_5,
        ),

        status: completionStatus(stockPrices, benchmarkPrices),
    };

    updateRow.run(payload);

    return payload;
}

async function main() {
    const rows = selectRows.all();

    console.log(`DB: ${DB_PATH}`);
    console.log(`Gefundene mention_impact rows: ${rows.length}`);
    console.log(`Rate limit: ${CALLS_PER_WINDOW} Calls, dann ${RATE_LIMIT_SLEEP_MS / 1000}s Pause`);

    let processed = 0;
    let failed = 0;

    for (const row of rows) {
        try {
            processed += 1;

            console.log('');
            console.log(`Bearbeite ${processed}/${rows.length}: ${row.id}`);
            console.log(`Company: ${row.company_name}`);
            console.log(`Ticker: ${row.stock_symbol}`);
            console.log(`Benchmark: ${row.benchmark_symbol}`);
            console.log(`Event time: ${row.event_time}`);

            const payload = await fillOne(row);

            console.log(`OK: ${row.id} -> ${payload.status}`);
            console.log(`price_at_event: ${payload.price_at_event}`);
            console.log(`price_1h: ${payload.price_1h}`);
            console.log(`price_eod: ${payload.price_eod}`);
            console.log(`stock_return_1h: ${payload.stock_return_1h}`);
            console.log(`delta_return_1h: ${payload.delta_return_1h}`);
        } catch (error) {
            failed += 1;

            console.error(`FAILED: ${row.id}`);
            console.error(error.message);

            markFailed.run({
                id: row.id,
                error_text: error.message,
            });
        }
    }

    console.log('');
    console.log('Fertig.');
    console.log(`Verarbeitet: ${processed}`);
    console.log(`Fehlgeschlagen: ${failed}`);
    console.log(`Polygon-Calls insgesamt: ${polygonCallCounter}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
