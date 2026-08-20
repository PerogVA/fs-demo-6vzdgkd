/* eslint-disable no-restricted-globals */
/**
 * Служебный работник: сайт открывается без сети.
 *
 * Флорист смотрит каталог в метро, на складе и в машине — там связь
 * пропадает регулярно. Без кеша это белый экран с динозавром, и человек
 * уходит; с кешем открывается последняя виденная версия.
 *
 * ПРАВИЛА КЕША. Их два, и они разные не для красоты:
 *   страницы — сначала сеть: цены и остатки не должны застревать. Сеть
 *              не ответила — отдаём последнюю сохранённую страницу;
 *   файлы    — сначала кеш: чанки, шрифты и фотографии не меняются, их
 *              имена содержат хеш сборки. Обновление приходит вместе
 *              с новой сборкой, потому что меняется ВЕРСИЯ ниже.
 *
 * ВЕРСИЮ МЕНЯТЬ ПРИ КАЖДОЙ ВЫКЛАДКЕ. Старый кеш при этом удаляется
 * целиком: иначе на телефоне остаётся мешанина из двух сборок, и это
 * худший вид ошибки — воспроизводится только у одного человека.
 */

const ВЕРСИЯ = "florsbor-v5";
const ОФЛАЙН = new Request("./", { cache: "reload" });

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(ВЕРСИЯ)
      .then((c) => c.add(ОФЛАЙН))
      /* Главная не скачалась — не повод не ставить работника: остальное
         он закеширует по ходу дела */
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((имена) =>
        Promise.all(имена.filter((и) => и !== ВЕРСИЯ).map((и) => caches.delete(и)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const запрос = e.request;
  if (запрос.method !== "GET") return;

  const адрес = new URL(запрос.url);
  /* Чужие домены не трогаем: шрифты Google отдают свой кеш сами,
     а вмешиваться в аналитику и подавно незачем */
  if (адрес.origin !== self.location.origin) return;

  const страница =
    запрос.mode === "navigate" ||
    (запрос.headers.get("accept") || "").includes("text/html");

  if (страница) {
    e.respondWith(
      fetch(запрос)
        .then((ответ) => {
          const копия = ответ.clone();
          caches.open(ВЕРСИЯ).then((c) => c.put(запрос, копия));
          return ответ;
        })
        .catch(() =>
          caches
            .match(запрос)
            .then((с) => с || caches.match(ОФЛАЙН))
            .then(
              (с) =>
                с ||
                new Response(
                  "<!doctype html><meta charset=utf-8><title>Нет сети</title>" +
                    "<p style=\"font:16px/1.5 sans-serif;padding:24px\">" +
                    "Страница не открывалась раньше, а сети сейчас нет. " +
                    "Вернитесь к ней, когда связь появится.",
                  { headers: { "Content-Type": "text/html; charset=utf-8" } }
                )
            )
        )
    );
    return;
  }

  e.respondWith(
    caches.match(запрос).then(
      (сохранённый) =>
        сохранённый ||
        fetch(запрос).then((ответ) => {
          /* Кешируем только удачные ответы: 404 и ошибки сервера,
             осевшие в кеше, потом не вычистить ничем, кроме смены версии */
          if (ответ.ok && ответ.type === "basic") {
            const копия = ответ.clone();
            caches.open(ВЕРСИЯ).then((c) => c.put(запрос, копия));
          }
          return ответ;
        })
    )
  );
});
