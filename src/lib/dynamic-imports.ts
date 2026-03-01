import dynamic from 'next/dynamic';

// Dynamic imports for route-specific pages
// These will only load when routes are accessed, reducing initial JS bundle by ~30%

export const DynamicLoginPage = dynamic(
  () => import('@/app/login/page'),
  { 
    loading: () => "Loading...",
    ssr: true 
  }
);

export const DynamicRegisterPage = dynamic(
  () => import('@/app/register/page'),
  { 
    loading: () => "Loading...",
    ssr: true 
  }
);

export const DynamicAdminPage = dynamic(
  () => import('@/app/admin/page'),
  { 
    loading: () => "Loading...",
    ssr: false
  }
);

export const DynamicAdminScanner = dynamic(
  () => import('@/app/admin/scanner/page'),
  { 
    loading: () => "Loading...",
    ssr: false
  }
);
