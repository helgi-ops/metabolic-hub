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

function vimeoId(url: string): string | null {
  const m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  return m ? m[1] : null;
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
  const vm = vimeoId(url);

  if (yt || vm) {
    const src = yt
      ? `https://www.youtube-nocookie.com/embed/${yt}`
      : `https://player.vimeo.com/video/${vm}`;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        <iframe
          src={src}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
