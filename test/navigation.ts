import { vi } from "vitest";

export const navigation = {
  pathname: "/",
  router: {
    back: vi.fn(),
    forward: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  },
};

export const navigationHooks = {
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
};
