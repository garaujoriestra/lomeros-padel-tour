'use client';

import dynamic from 'next/dynamic';

// three.js pesa: solo en cliente y fuera del bundle inicial de la página.
const PadelBall3D = dynamic(() => import('./padel-ball-3d'), { ssr: false });

export function Ball3DLazy() {
  return <PadelBall3D />;
}
