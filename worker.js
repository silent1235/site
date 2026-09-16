/**
 * Steam status proxy — Cloudflare Worker.
 *
 * Зачем он нужен:
 *  - Steam Web API не отдаёт заголовки CORS, поэтому браузер
 *    не может вызвать его напрямую с твоего сайта.
 *  - Ключ Steam API нельзя класть в клиентский JS — его увидит
 *    любой в "просмотре кода страницы" и сможет им пользоваться.
 *
 * Этот воркер делает запрос к Steam на сервере (не в браузере),
 * прячет ключ и отдаёт браузеру только безопасный JSON с CORS-заголовками.
 *
 * НАСТРОЙКА (один раз):
 *  1. Создай воркер в Cloudflare Dashboard → Workers & Pages → Create.
 *  2. Вставь этот код в редактор Worker'а.
 *  3. В Settings → Variables добавь переменные (как Secret, не Plaintext):
 *       STEAM_API_KEY  — ключ с https://steamcommunity.com/dev/apikey
 *       STEAM_IDS      — SteamID64 через запятую, например:
 *                         76561199369148860,76561198XXXXXXXXX
 *  4. Замени ALLOWED_ORIGIN ниже на домен своего сайта.
 *  5. Deploy. Скопируй адрес воркера (что-то вроде
 *     https://steam-status.твой-ник.workers.dev) и вставь его
 *     в index.html в константу STEAM_PROXY_URL.
 *
 * Важно: оба Steam-профиля должны иметь настройку
 * "Игровая информация" (Game details) = Public в приватности профиля,
 * иначе Steam не отдаст название игры, в которую ты играешь.
 */

const ALLOWED_ORIGIN = "https://your-domain.example"; // ⚠️ замени на свой домен

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (!env.STEAM_API_KEY || !env.STEAM_IDS) {
      return new Response(
        JSON.stringify({ error: "missing_env_vars" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiUrl =
      "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/" +
      `?key=${env.STEAM_API_KEY}&steamids=${env.STEAM_IDS}`;

    try {
      const steamRes = await fetch(apiUrl);

      if (!steamRes.ok) {
        return new Response(
          JSON.stringify({ error: "steam_api_error", status: steamRes.status }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data = await steamRes.json();
      const players = (data.response && data.response.players) || [];

      const result = players.map((p) => ({
        steamid: p.steamid,
        name: p.personaname,
        state: p.personastate, // 0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 trade, 6 play
        inGame: !!p.gameextrainfo,
        game: p.gameextrainfo || null,
        avatar: p.avatarfull || null,
        profileUrl: p.profileurl || null,
      }));

      return new Response(
        JSON.stringify({ players: result, ts: Date.now() }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "fetch_failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  },
};
