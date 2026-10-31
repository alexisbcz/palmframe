import { defineMessages } from "@/i18n/core"

export const messages = defineMessages({
  en: {
    title: "Translate a book",
    body: "Upload goes straight to storage, so a file up to 200 MB never passes through a function. You must confirm you own the book or may translate it; books are private and nothing here publishes them. Reading a file is free. Translation is charged up front from the estimate, and whatever isn't used comes back when the job ends, so a stopped or failed job costs only what was finished. Repeating a call with the same Idempotency-Key returns the same job and charges nothing. These routes need Labs turned on, and a key limited to some projects can't reach them.",
    glossary: {
      title: "Glossaries and segments",
      body: "Segment edits send the version you read; a newer row answers 409 stale_version. Locked segments answer 423 and are never retranslated. Import and export glossaries as CSV or TBX.",
    },
    webhooks: {
      title: "Webhooks",
      body: 'Create one to hear when a job ends: job.succeeded, job.failed, job.cancelled. The secret is shown once. Each POST carries a Palmframe-Signature header, t=<unix time>,v1=<hex>, where v1 is the HMAC-SHA256 of "<t>.<raw body>" under your secret. Check it, and reject old timestamps. Failed deliveries retry with growing gaps, six tries in all. URLs must be public https; redirects aren\'t followed.',
    },
    limits: {
      title: "Book limits",
      body: "200 MB per file, 2,000 PDF pages, 1.5 million words, 200 books per account, and 3 running jobs per account. One job runs on a book at a time, apart from exports. The API's usual rate limits apply.",
    },
  },
  fr: {
    title: "Traduire un livre",
    body: "L’envoi va directement au stockage : un fichier jusqu’à 200 Mo ne passe jamais par une fonction. Vous devez confirmer que le livre vous appartient ou que vous pouvez le traduire ; les livres restent privés et rien ici ne les publie. La lecture d’un fichier est gratuite. La traduction est débitée d’avance selon l’estimation, et ce qui n’est pas utilisé revient à la fin : une tâche arrêtée ou échouée ne coûte que ce qui a été terminé. Répéter un appel avec le même Idempotency-Key renvoie la même tâche sans rien débiter. Ces routes demandent d’activer Labs, et une clé limitée à certains projets n’y a pas accès.",
    glossary: {
      title: "Glossaires et segments",
      body: "Une modification de segment envoie la version lue ; une ligne plus récente répond 409 stale_version. Les segments verrouillés répondent 423 et ne sont jamais retraduits. Importez et exportez les glossaires en CSV ou TBX.",
    },
    webhooks: {
      title: "Webhooks",
      body: "Créez-en un pour savoir quand une tâche se termine : job.succeeded, job.failed, job.cancelled. Le secret n’est affiché qu’une fois. Chaque POST porte un en-tête Palmframe-Signature, t=<heure unix>,v1=<hex>, où v1 est le HMAC-SHA256 de « <t>.<corps brut> » avec votre secret. Vérifiez-le et refusez les horodatages anciens. Les envois échoués sont retentés à intervalles croissants, six essais au total. Les URL doivent être en https public ; les redirections ne sont pas suivies.",
    },
    limits: {
      title: "Limites des livres",
      body: "200 Mo par fichier, 2 000 pages de PDF, 1,5 million de mots, 200 livres par compte et 3 tâches en cours par compte. Une seule tâche tourne sur un livre à la fois, hors exports. Les limites habituelles de l’API s’appliquent.",
    },
  },
  es: {
    title: "Traducir un libro",
    body: "La subida va directa al almacenamiento, así que un archivo de hasta 200 MB nunca pasa por una función. Debes confirmar que el libro es tuyo o que puedes traducirlo; los libros son privados y nada aquí los publica. Leer un archivo es gratis. La traducción se cobra por adelantado según la estimación, y lo no usado vuelve al terminar, de modo que un trabajo detenido o fallido solo cuesta lo terminado. Repetir una llamada con el mismo Idempotency-Key devuelve el mismo trabajo y no cobra nada. Estas rutas requieren activar Labs, y una clave limitada a ciertos proyectos no llega a ellas.",
    glossary: {
      title: "Glosarios y segmentos",
      body: "Al editar un segmento envía la versión leída; una fila más reciente responde 409 stale_version. Los segmentos bloqueados responden 423 y nunca se retraducen. Importa y exporta glosarios en CSV o TBX.",
    },
    webhooks: {
      title: "Webhooks",
      body: "Crea uno para saber cuándo termina un trabajo: job.succeeded, job.failed, job.cancelled. El secreto se muestra una vez. Cada POST lleva una cabecera Palmframe-Signature, t=<hora unix>,v1=<hex>, donde v1 es el HMAC-SHA256 de «<t>.<cuerpo sin procesar>» con tu secreto. Compruébalo y rechaza marcas de tiempo antiguas. Los envíos fallidos se reintentan con esperas crecientes, seis intentos en total. Las URL deben ser https públicas; no se siguen redirecciones.",
    },
    limits: {
      title: "Límites de libros",
      body: "200 MB por archivo, 2000 páginas de PDF, 1,5 millones de palabras, 200 libros por cuenta y 3 trabajos en curso por cuenta. Solo corre un trabajo por libro a la vez, salvo exportaciones. Se aplican los límites habituales de la API.",
    },
  },
  de: {
    title: "Ein Buch übersetzen",
    body: "Der Upload geht direkt in den Speicher, eine Datei bis 200 MB läuft also nie durch eine Funktion. Du musst bestätigen, dass das Buch dir gehört oder du es übersetzen darfst; Bücher bleiben privat und nichts hier veröffentlicht sie. Das Einlesen ist kostenlos. Die Übersetzung wird vorab laut Schätzung abgebucht, und Ungenutztes kommt am Ende zurück, sodass ein angehaltener oder fehlgeschlagener Auftrag nur das Fertige kostet. Ein Aufruf mit demselben Idempotency-Key liefert denselben Auftrag und bucht nichts ab. Diese Routen brauchen aktivierte Labs, und ein auf Projekte beschränkter Schlüssel erreicht sie nicht.",
    glossary: {
      title: "Glossare und Segmente",
      body: "Beim Bearbeiten eines Segments sendest du die gelesene Version; eine neuere Zeile antwortet 409 stale_version. Gesperrte Segmente antworten 423 und werden nie neu übersetzt. Glossare lassen sich als CSV oder TBX importieren und exportieren.",
    },
    webhooks: {
      title: "Webhooks",
      body: "Lege einen an, um zu erfahren, wann ein Auftrag endet: job.succeeded, job.failed, job.cancelled. Das Geheimnis wird einmal angezeigt. Jeder POST trägt den Header Palmframe-Signature, t=<Unix-Zeit>,v1=<hex>, wobei v1 das HMAC-SHA256 von „<t>.<Rohdaten>“ mit deinem Geheimnis ist. Prüfe es und lehne alte Zeitstempel ab. Fehlgeschlagene Zustellungen werden mit wachsenden Abständen wiederholt, sechs Versuche insgesamt. URLs müssen öffentliches https sein; Weiterleitungen werden nicht befolgt.",
    },
    limits: {
      title: "Grenzen für Bücher",
      body: "200 MB pro Datei, 2.000 PDF-Seiten, 1,5 Millionen Wörter, 200 Bücher pro Konto und 3 laufende Aufträge pro Konto. Pro Buch läuft jeweils ein Auftrag, Exporte ausgenommen. Es gelten die üblichen API-Limits.",
    },
  },
  it: {
    title: "Tradurre un libro",
    body: "Il caricamento va direttamente allo storage, quindi un file fino a 200 MB non passa mai da una funzione. Devi confermare che il libro è tuo o che puoi tradurlo; i libri restano privati e nulla qui li pubblica. Leggere un file è gratis. La traduzione viene addebitata in anticipo secondo la stima, e ciò che non si usa torna alla fine: un lavoro fermato o fallito costa solo quanto è stato completato. Ripetere una chiamata con lo stesso Idempotency-Key restituisce lo stesso lavoro senza addebiti. Queste rotte richiedono Labs attivo, e una chiave limitata ad alcuni progetti non vi accede.",
    glossary: {
      title: "Glossari e segmenti",
      body: "Modificando un segmento invii la versione letta; una riga più recente risponde 409 stale_version. I segmenti bloccati rispondono 423 e non vengono mai ritradotti. Importa ed esporta i glossari in CSV o TBX.",
    },
    webhooks: {
      title: "Webhook",
      body: "Creane uno per sapere quando un lavoro finisce: job.succeeded, job.failed, job.cancelled. Il segreto si vede una sola volta. Ogni POST porta un’intestazione Palmframe-Signature, t=<ora unix>,v1=<hex>, dove v1 è l’HMAC-SHA256 di «<t>.<corpo grezzo>» con il tuo segreto. Verificala e rifiuta i timestamp vecchi. Gli invii falliti si ripetono a intervalli crescenti, sei tentativi in tutto. Gli URL devono essere https pubblici; i reindirizzamenti non vengono seguiti.",
    },
    limits: {
      title: "Limiti dei libri",
      body: "200 MB per file, 2.000 pagine PDF, 1,5 milioni di parole, 200 libri per account e 3 lavori in corso per account. Su un libro gira un lavoro alla volta, esportazioni escluse. Valgono i consueti limiti dell’API.",
    },
  },
  ja: {
    title: "本を翻訳する",
    body: "アップロードはストレージへ直接送られるため、最大200 MBのファイルでも関数を経由しません。本の所有者であること、または翻訳する権利があることの確認が必要です。本は非公開で、ここから公開されることはありません。ファイルの読み込みは無料です。翻訳は見積もりに基づいて先に請求され、未使用分はジョブ終了時に返却されるため、停止または失敗したジョブは完了分の料金のみです。同じIdempotency-Keyで呼び出すと同じジョブが返り、追加請求はありません。これらのルートにはLabsの有効化が必要で、プロジェクトを限定したキーでは利用できません。",
    glossary: {
      title: "用語集とセグメント",
      body: "セグメントの編集では読み取ったversionを送ります。より新しい行があれば409 stale_versionが返ります。ロックされたセグメントは423を返し、再翻訳されません。用語集はCSVまたはTBXで読み込みと書き出しができます。",
    },
    webhooks: {
      title: "Webhook",
      body: "ジョブの終了を受け取るには作成してください: job.succeeded、job.failed、job.cancelled。シークレットは一度だけ表示されます。各POSTにはPalmframe-Signatureヘッダー（t=<UNIX時刻>,v1=<16進数>）が付きます。v1はシークレットによる「<t>.<生の本文>」のHMAC-SHA256です。検証し、古いタイムスタンプは拒否してください。失敗した配信は間隔を広げながら合計6回試行します。URLは公開されたhttpsである必要があり、リダイレクトは追跡しません。",
    },
    limits: {
      title: "書籍の上限",
      body: "ファイルあたり200 MB、PDF 2,000ページ、150万語、アカウントあたり200冊、実行中ジョブ3件。1冊につき同時に1ジョブです（書き出しを除く）。APIの通常のレート制限が適用されます。",
    },
  },
})
