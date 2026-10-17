import Link from 'next/link';
export default function NotFound() { return <main className="max-w-xl mx-auto py-20"><h1>This page isn’t here.</h1><p className="text-muted my-5">Return to your workspace to continue.</p><Link className="btn" href="/">Back to workspace</Link></main>; }
