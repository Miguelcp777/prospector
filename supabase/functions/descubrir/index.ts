// ============================================================
// Edge Function · descubrir
//
// El worker de descubrimiento, troceado para caber en Supabase.
//
// La decisión 0001 daba por hecho que esto no cabía en una Edge Function:
// cientos de consultas a Places y varios minutos contra un timeout corto.
// Cabe si se invierte el problema — en vez de un proceso largo que recorre
// la campaña entera, cada invocación se come unas pocas tareas y se va. El
// estado del recorrido vive en job_tareas. Ver decisiones/0002.
//
// Límites que fijan el diseño (verificados en la doc de Supabase, ago 2026):
//   CPU:        2s por petición — no cuenta la espera de red, y aquí casi
//               todo es espera de red. No es la restricción que aprieta.
//   Wall clock: 150s plan free / 400s de pago
//   Idle:       150s sin responder → 504
// De ahí PLAZO_MS: paramos antes de acercarnos al borde.
//
// Lo despierta pg_cron cada minuto. Ver 002_descubrimiento_y_demo.sql.
//
// Desplegar: supabase functions deploy descubrir --no-verify-jwt
// Secretos:  supabase secrets set GOOGLE_PLACES_API_KEY=...
//            supabase secrets set WORKER_SECRETO=<cadena larga aleatoria>
// ============================================================

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const PLAZO_MS = Number(Deno.env.get("DESCUBRIR_PLAZO_MS") ?? 100_000);
const TAREAS_POR_TANDA = 5;
const PAGINAS_MAX = 3;          // Places corta en 60 resultados: 3 × 20
const RESULTADOS_POR_PAGINA = 20;

const CAMPOS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "nextPageToken",
].join(",");

type Tarea = {
  id: string;
  job_id: string;
  tenant_id: string;
  campaign_id: string;
  segment_id: string | null;
  query: string;
  pagina: number;
  page_token: string | null;
  intentos: number;
};

type Campana = {
  id: string;
  ciudad: string;
  radio_km: number;
  lat: number | null;
  lng: number | null;
};

Deno.serve(async (req) => {
  // No lleva JWT: la despierta el cron, no un usuario. El secreto compartido
  // es lo único que separa esta función de un botón de "gasta mi saldo de
  // Places" abierto a internet.
  const secreto = Deno.env.get("WORKER_SECRETO");
  if (!secreto || req.headers.get("x-worker-secreto") !== secreto) {
    return new Response(JSON.stringify({ error: "No autorizado." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const hasta = Date.now() + PLAZO_MS;
  const campanas = new Map<string, Campana>();
  let procesadas = 0, leads = 0, errores = 0;

  while (Date.now() < hasta) {
    const { data: tareas, error } = await supabase
      .rpc("reclamar_tareas", { p_limite: TAREAS_POR_TANDA });

    if (error) {
      console.error("No se pudieron reclamar tareas:", error.message);
      break;
    }
    if (!tareas || tareas.length === 0) break;   // Cola vacía: nos vamos.

    for (const tarea of tareas as Tarea[]) {
      // Una tarea a medias es peor que una tarea no empezada: la devolvemos
      // a la cola en vez de dejarla colgada en_curso.
      if (Date.now() >= hasta) {
        await devolverACola(supabase, tarea, "Plazo de la invocación agotado");
        continue;
      }

      try {
        const campana = await cargarCampana(supabase, tarea.campaign_id, campanas);
        const nuevos = await procesar(supabase, tarea, campana);
        leads += nuevos;
        procesadas++;
      } catch (e) {
        errores++;
        const mensaje = e instanceof Error ? e.message : String(e);
        console.error(`Tarea ${tarea.id} (${tarea.query}):`, mensaje);

        // Places falla por rachas: rate limit, cuota, un 503 suelto. Tres
        // intentos antes de darla por perdida.
        if (tarea.intentos < 3) {
          await devolverACola(supabase, tarea, mensaje);
        } else {
          await supabase.from("job_tareas")
            .update({ estado: "error", detalle: mensaje.slice(0, 300), actualizado_en: new Date().toISOString() })
            .eq("id", tarea.id);
        }
      }

      await supabase.rpc("cerrar_job_si_completo", { p_job: tarea.job_id });
    }
  }

  return new Response(
    JSON.stringify({ procesadas, leads, errores }),
    { headers: { "content-type": "application/json" } },
  );
});

// ------------------------------------------------------------

async function devolverACola(supabase: SupabaseClient, tarea: Tarea, motivo: string) {
  await supabase.from("job_tareas")
    .update({
      estado: "pendiente",
      detalle: motivo.slice(0, 300),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", tarea.id);
}

/**
 * La campaña se guarda en un mapa por invocación: una tanda toca la misma
 * campaña muchas veces y no tiene sentido releerla cada vez.
 */
async function cargarCampana(
  supabase: SupabaseClient,
  id: string,
  cache: Map<string, Campana>,
): Promise<Campana> {
  const guardada = cache.get(id);
  if (guardada) return guardada;

  const { data, error } = await supabase
    .from("campaigns").select("id, ciudad, radio_km, lat, lng").eq("id", id).single();
  if (error || !data) throw new Error("Campaña no encontrada");

  const campana = data as Campana;

  // Places quiere un centro en coordenadas, no un nombre de ciudad.
  // Geocodificamos una vez por campaña y lo cacheamos en la fila.
  if (campana.lat === null || campana.lng === null) {
    const centro = await geocodificar(campana.ciudad);
    campana.lat = centro.lat;
    campana.lng = centro.lng;
    await supabase.from("campaigns")
      .update({ lat: centro.lat, lng: centro.lng }).eq("id", id);
  }

  cache.set(id, campana);
  return campana;
}

async function geocodificar(ciudad: string): Promise<{ lat: number; lng: number }> {
  const r = await llamarPlaces({
    textQuery: ciudad,
    languageCode: "es",
    regionCode: "ES",
    pageSize: 1,
  }, "places.location");

  const sitio = r.places?.[0];
  if (!sitio?.location) throw new Error(`No se pudo situar "${ciudad}" en el mapa`);
  return { lat: sitio.location.latitude, lng: sitio.location.longitude };
}

/**
 * Clave de caché: la búsqueda, no el token.
 *
 * Los pageToken de Places caducan, así que una caché indexada por token no
 * se puede reproducir más tarde. Por (query, centro, radio, página) sí.
 *
 * El centro va redondeado a tres decimales (~100 m): dos campañas de la
 * misma ciudad no deben fallar el acierto por una diferencia de metros.
 */
function claveCache(query: string, campana: Campana, pagina: number): string {
  return [
    query.toLowerCase().trim(),
    campana.lat.toFixed(3),
    campana.lng.toFixed(3),
    Math.min(50_000, campana.radio_km * 1000),
    pagina,
  ].join("|");
}

async function procesar(
  supabase: SupabaseClient,
  tarea: Tarea,
  campana: Campana,
): Promise<number> {
  const clave = claveCache(tarea.query, campana, tarea.pagina);

  const { data: cacheado } = await supabase
    .rpc("leer_cache_places", { p_tenant: tarea.tenant_id, p_clave: clave })
    .maybeSingle();

  const deCache = !!cacheado;
  let respuesta: { places?: PlaceApi[]; nextPageToken?: string };
  let haySiguiente: boolean;

  if (cacheado) {
    // Acierto: ni llamada ni consulta contada. Esto es el ahorro.
    respuesta = cacheado.respuesta;
    haySiguiente = cacheado.hay_siguiente;
  } else {
    respuesta = await llamarPlaces({
      textQuery: tarea.query,
      languageCode: "es",
      regionCode: "ES",
      pageSize: RESULTADOS_POR_PAGINA,
      ...(tarea.page_token ? { pageToken: tarea.page_token } : {}),
      locationBias: {
        circle: {
          center: { latitude: campana.lat, longitude: campana.lng },
          radius: Math.min(50_000, campana.radio_km * 1000),  // Places topa en 50 km
        },
      },
    }, CAMPOS);

    haySiguiente = !!respuesta.nextPageToken;

    // Cada página pedida es una consulta facturable: la contamos aunque
    // venga vacía. Un acierto de caché no pasa por aquí.
    await supabase.rpc("sumar_consulta", { p_job: tarea.job_id });

    // Sin el nextPageToken: caduca, y guardarlo invitaría a reusarlo.
    await supabase.rpc("guardar_cache_places", {
      p_tenant: tarea.tenant_id,
      p_clave: clave,
      p_respuesta: { places: respuesta.places ?? [] },
      p_hay_siguiente: haySiguiente,
    });
  }

  const sitios = respuesta.places ?? [];

  const filas = sitios
    .filter((p: PlaceApi) => p.id && p.displayName?.text)
    .map((p: PlaceApi) => ({
      tenant_id: tarea.tenant_id,
      campaign_id: tarea.campaign_id,
      segment_id: tarea.segment_id,
      place_id: p.id,
      nombre: p.displayName!.text.slice(0, 200),
      direccion: p.formattedAddress ?? null,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      web: p.websiteUri ?? null,
      telefono: p.nationalPhoneNumber ?? null,
      // El email no lo da Places. Lo pone el enriquecimiento (Fase 2), y
      // solo buzones corporativos. Ver docs/compliance.md.
      resenas: p.userRatingCount ?? null,
      puntuacion_ext: p.rating ?? null,
      fuente: "places",
    }));

  if (filas.length > 0) {
    // ignoreDuplicates: el mismo sitio sale en varios segmentos y en varias
    // queries. El primero que lo encuentra se lo queda; no lo reasignamos.
    const { error } = await supabase
      .from("leads")
      .upsert(filas, { onConflict: "campaign_id,place_id", ignoreDuplicates: true });
    if (error) throw new Error(`Guardando leads: ${error.message}`);
  }

  // Encadena la página siguiente como tarea nueva, en vez de recorrer la
  // paginación entera aquí dentro. Así el trozo sigue siendo pequeño.
  let encadenar = haySiguiente && tarea.pagina < PAGINAS_MAX;

  if (encadenar && deCache) {
    // Desde caché no hay token válido, así que la siguiente página solo se
    // puede servir si también está cacheada. Pedirla a Places sin token
    // devolvería la página 1 otra vez: misma factura, cero resultados
    // nuevos, y una tarea que miente sobre qué página trae.
    const { data: siguiente } = await supabase
      .rpc("leer_cache_places", {
        p_tenant: tarea.tenant_id,
        p_clave: claveCache(tarea.query, campana, tarea.pagina + 1),
      })
      .maybeSingle();
    if (!siguiente) encadenar = false;
  }

  if (encadenar) {
    await supabase.from("job_tareas").insert({
      job_id: tarea.job_id,
      tenant_id: tarea.tenant_id,
      campaign_id: tarea.campaign_id,
      segment_id: tarea.segment_id,
      query: tarea.query,
      pagina: tarea.pagina + 1,
      page_token: deCache ? null : (respuesta.nextPageToken ?? null),
    });
  }

  await supabase.from("job_tareas")
    .update({
      estado: "hecho",
      detalle: `${filas.length} resultados${deCache ? " (de caché, sin coste)" : ""}`,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", tarea.id);

  return filas.length;
}

type PlaceApi = {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
};

async function llamarPlaces(
  cuerpo: Record<string, unknown>,
  campos: string,
): Promise<{ places?: PlaceApi[]; nextPageToken?: string }> {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": Deno.env.get("GOOGLE_PLACES_API_KEY")!,
      "X-Goog-FieldMask": campos,
    },
    body: JSON.stringify(cuerpo),
  });

  if (!r.ok) {
    throw new Error(`Places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return await r.json();
}
