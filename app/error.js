'use client';
export default function ErrorPage({ reset }) { return <main className="max-w-xl mx-auto py-20"><h1>Something went wrong.</h1><p className="text-muted my-5">Please try again. If this continues, contact your administrator.</p><button className="btn" onClick={reset}>Try again</button></main>; }
