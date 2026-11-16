// Renders a lesson video from whatever URL the author stored: YouTube, Vimeo,
// or a direct file. Falls back to a tasteful placeholder when there's no video
// yet (the courses are still being filled in).

function youtubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(
      url,
    );
  return m ? m[1] : null;
}

// Vimeo id plus the privacy hash unlisted videos need in the embed
// (vimeo.com/123/abcdef, or player.vimeo.com/video/123?h=abcdef).
function vimeoEmbed(url: string): string | null {
  const m = /vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/i.exec(url);
  if (!m) return null;
  const hash = m[2] ?? /[?&]h=([0-9a-f]+)/i.exec(url)?.[1];
  return `https://player.vimeo.com/video/${m[1]}${hash ? `?h=${hash}` : ""}`;
}

export function LessonVideo({
  url,
  title,
}: {
  url: string | null | undefined;
  title: string;
}) {
  if (!url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted text-center">
        <div className="px-6">
          <div className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Myndband væntanlegt
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Þessi lexía hefur ekki fengið myndband ennþá.
          </p>
        </div>
      </div>
    );
  }

  const yt = youtubeId(url);
  const vm = vimeoEmbed(url);

  if (yt || vm) {
    const src = yt ? `https://www.youtube-nocookie.com/embed/${yt}` : vm!;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        <iframe
          src={src}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={url} controls className="h-full w-full" />
    </div>
  );
}
