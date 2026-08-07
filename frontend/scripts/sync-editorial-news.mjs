import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const FEEDS = [
  {
    sourceKey: "sensacine-all",
    sourceLabel: "SensaCine",
    sourceType: "all",
    url: "https://www.sensacine.com/rss/noticias.xml"
  },
  {
    sourceKey: "sensacine-movies",
    sourceLabel: "SensaCine Cine",
    sourceType: "movies",
    url: "https://www.sensacine.com/rss/noticias-cine.xml"
  },
  {
    sourceKey: "sensacine-series",
    sourceLabel: "SensaCine Series",
    sourceType: "series",
    url: "https://www.sensacine.com/rss/noticias-series.xml"
  },
  {
    sourceKey: "sensacine-tv",
    sourceLabel: "SensaCine TV",
    sourceType: "tv",
    url: "https://www.sensacine.com/rss/noticias-television.xml"
  }
];

const TOPIC_PATTERNS = {
  releases: [/estren/i, /ya disponible/i, /llega a los cines/i, /streaming/i, /hoy en /i],
  trailers: [/tr[aá]iler/i, /teaser/i, /primer vistazo/i, /avance/i],
  awards: [/oscar/i, /festival/i, /cannes/i, /venecia/i, /goya/i, /emmy/i, /globos de oro/i],
  casting: [/reparto/i, /fichaje/i, /se une/i, /interpretar[aá]/i, /protagonizar[aá]/i, /rodaje/i, /anuncio/i],
  mainstream: [/marvel/i, /\bdc\b/i, /star wars/i, /avatar/i, /spider-man/i, /vengadores/i, /netflix/i],
  auteur: [/nolan/i, /tarantino/i, /wenders/i, /festival/i, /\ba24\b/i, /cannes/i, /venecia/i]
};

const GENRE_PATTERNS = {
  action: [/acci[oó]n/i, /superh[eé]roe/i],
  animation: [/anime/i, /animaci[oó]n/i],
  comedy: [/comedia/i],
  documentary: [/documental/i],
  drama: [/drama/i, /biopic/i],
  fantasy: [/fantas[ií]a/i],
  horror: [/terror/i, /horror/i],
  romance: [/rom[aá]ntic/i],
  scifi: [/ciencia ficci[oó]n/i, /sci-fi/i, /isekai/i],
  thriller: [/thriller/i, /suspense/i]
};

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function decodeHtml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function getAttr(block, tagName, attrName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*${attrName}="([^"]+)"`, "i"));
  return match?.[1] ?? null;
}

function parsePubDate(value) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const fallback = value.match(
    /^(\d{2}) (\w{3}) (\d{4}) (\d{2}:\d{2}:\d{2}) (\d{4})$/i
  );
  if (!fallback) {
    return new Date().toISOString();
  }

  const [, day, monthLabel, year, time, offset] = fallback;
  const months = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };
  const month = months[monthLabel.toLowerCase()] ?? "01";
  return new Date(`${year}-${month}-${day}T${time}${offset.slice(0, 3)}:${offset.slice(3)}`).toISOString();
}

function classifyItem(item, sourceType) {
  const haystack = `${item.title} ${item.summary} ${item.sourceSection ?? ""}`.toLowerCase();
  const editorialTags = new Set();
  const genreTags = new Set();

  if (sourceType === "movies") {
    editorialTags.add("movies");
  } else if (sourceType === "series") {
    editorialTags.add("series");
  } else if (sourceType === "tv") {
    editorialTags.add("series");
  } else if (item.url.includes("/noticias/cine/")) {
    editorialTags.add("movies");
  } else if (item.url.includes("/noticias/series/")) {
    editorialTags.add("series");
  }

  for (const [tag, patterns] of Object.entries(TOPIC_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(haystack))) {
      editorialTags.add(tag);
    }
  }

  for (const [tag, patterns] of Object.entries(GENRE_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(haystack))) {
      genreTags.add(tag);
    }
  }

  const badge = editorialTags.has("trailers")
    ? "Trailer"
    : editorialTags.has("releases")
      ? "Estreno"
      : editorialTags.has("mainstream")
        ? "Tendencia"
        : "Noticia";

  const mediaScope =
    sourceType === "movies"
      ? "movie"
      : sourceType === "series"
        ? "series"
        : sourceType === "tv"
          ? "tv"
          : editorialTags.has("movies") && !editorialTags.has("series")
            ? "movie"
            : editorialTags.has("series") && !editorialTags.has("movies")
              ? "series"
              : "mixed";

  return {
    badge,
    mediaScope,
    editorialTags: [...editorialTags],
    genreTags: [...genreTags]
  };
}

function parseFeed(xml, feed) {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);

  return itemBlocks.map((block) => {
    const title = stripHtml(getTag(block, "title") ?? "");
    const link = stripHtml(getTag(block, "link") ?? "");
    const description = stripHtml(getTag(block, "description") ?? "");
    const sourceSection = stripHtml(getTag(block, "category") ?? "");
    const author =
      stripHtml(getTag(block, "author") ?? "") ||
      stripHtml(getTag(block, "dc:creator") ?? "") ||
      null;
    const guid = stripHtml(getTag(block, "guid") ?? link);
    const imageUrl = getAttr(block, "enclosure", "url") ?? getAttr(block, "media:thumbnail", "url");
    const publishedAt = parsePubDate(stripHtml(getTag(block, "pubDate") ?? new Date().toUTCString()));
    const classification = classifyItem(
      {
        title,
        summary: description,
        sourceSection,
        url: link
      },
      feed.sourceType
    );

    return {
      external_id: `${feed.sourceKey}:${guid}`,
      title,
      url: link,
      summary: description,
      image_url: imageUrl,
      author,
      source_section: sourceSection || null,
      source_label: feed.sourceLabel,
      media_scope: classification.mediaScope,
      badge: classification.badge,
      editorial_tags: classification.editorialTags,
      genre_tags: classification.genreTags,
      raw_payload: {
        sourceKey: feed.sourceKey,
        guid
      },
      published_at: publishedAt
    };
  });
}

async function main() {
  loadEnvFile();

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en frontend/.env para sincronizar noticias."
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  const { data: sources, error: sourceError } = await supabase
    .from("editorial_sources")
    .select("id, source_key, feed_url, source_type, name")
    .eq("is_active", true);

  if (sourceError) {
    throw sourceError;
  }

  const sourceMap = new Map((sources ?? []).map((source) => [source.source_key, source]));
  const rowsToUpsert = [];

  for (const feed of FEEDS) {
    const source = sourceMap.get(feed.sourceKey);
    if (!source) {
      console.warn(`Saltando ${feed.sourceKey}: no existe en editorial_sources.`);
      continue;
    }

    const response = await fetch(feed.url);
    if (!response.ok) {
      throw new Error(`No pude leer ${feed.url}: ${response.status}`);
    }

    const xml = await response.text();
    const parsedItems = parseFeed(xml, feed).map((item) => ({
      ...item,
      source_id: source.id,
      updated_at: new Date().toISOString()
    }));

    rowsToUpsert.push(...parsedItems);
  }

  if (!rowsToUpsert.length) {
    console.log("No encontre noticias para sincronizar.");
    return;
  }

  const { error: upsertError } = await supabase.from("news_items").upsert(rowsToUpsert, {
    onConflict: "external_id"
  });

  if (upsertError) {
    throw upsertError;
  }

  console.log(`Sincronizadas ${rowsToUpsert.length} noticias editoriales.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
