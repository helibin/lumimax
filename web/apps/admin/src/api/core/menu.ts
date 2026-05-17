import type { RouteRecordStringComponent } from '@lumimax/types';

import { requestClient } from '#/api/request';

import { normalizeAdminItems } from './admin-response';

export namespace MenuApi {
  export type MenuType = 'button' | 'catalog' | 'external' | 'menu';
  export type MenuStatus = 'active' | 'disabled';

  export interface MenuItem {
    children?: MenuItem[];
    code: string;
    component: null | string;
    createdAt?: string;
    externalLink: null | string;
    extra: Record<string, unknown>;
    icon: null | string;
    id: string;
    keepAlive: boolean;
    menuType: MenuType;
    name: string;
    parentId: null | string;
    permissionCode: null | string;
    routePath: null | string;
    sort: number;
    status: MenuStatus;
    updatedAt?: string;
    visible: boolean;
  }

  export interface MenuTreeItem extends MenuItem {
    children?: MenuTreeItem[];
  }

  export interface CreateMenuParams {
    code: string;
    component?: null | string;
    externalLink?: null | string;
    extra?: Record<string, unknown>;
    icon?: null | string;
    keepAlive?: boolean;
    menuType?: MenuType;
    name: string;
    parentId?: null | string;
    permissionCode?: null | string;
    routePath?: null | string;
    sort?: number;
    status?: MenuStatus;
    visible?: boolean;
  }

  export interface UpdateMenuParams {
    code?: string;
    component?: null | string;
    externalLink?: null | string;
    extra?: Record<string, unknown>;
    icon?: null | string;
    keepAlive?: boolean;
    menuType?: MenuType;
    name?: string;
    parentId?: null | string;
    permissionCode?: null | string;
    routePath?: null | string;
    sort?: number;
    status?: MenuStatus;
    visible?: boolean;
  }
}

interface PagedResult<T> {
  items: T[];
  total: number;
}

function pickObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return fallback;
}

function pickNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonObject(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    try {
      return pickObject(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return pickObject(value);
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapBackendMenuType(menuType: unknown): MenuApi.MenuType {
  const value = pickString(menuType)?.toLowerCase();
  if (value === 'catalog' || value === 'button' || value === 'external') {
    return value;
  }
  return 'menu';
}

function normalizeMenuItem(payload: unknown): MenuApi.MenuTreeItem {
  const item = pickObject(payload);
  const extra = parseJsonObject(item.extra_json ?? item.extraJson ?? item.extra);
  const children = normalizeMenuTree(item.children);

  return {
    children,
    code: pickString(item.code) ?? '',
    component: pickString(item.component),
    createdAt: pickString(item.createdAt) ?? undefined,
    externalLink: pickString(item.external_link ?? item.externalLink),
    extra,
    icon: pickString(item.icon),
    id: pickString(item.id) ?? '',
    keepAlive: pickBoolean(item.keep_alive ?? item.keepAlive, false),
    menuType: mapBackendMenuType(item.menu_type ?? item.menuType),
    name: pickString(item.name) ?? '',
    parentId: pickString(item.parent_id ?? item.parentId),
    permissionCode: pickString(item.permission_code ?? item.permissionCode),
    routePath: pickString(item.route_path ?? item.routePath ?? item.path),
    sort: pickNumber(item.sort ?? item.sortNo, 0),
    status: pickString(item.status) === 'disabled' ? 'disabled' : 'active',
    updatedAt: pickString(item.updatedAt) ?? undefined,
    visible: pickBoolean(item.visible, true),
  };
}

function normalizeMenuTree(payload: unknown): MenuApi.MenuTreeItem[] {
  return parseJsonArray(payload).map((item) => normalizeMenuItem(item));
}

function getRouteTreeFromPayload(payload: unknown): RouteRecordStringComponent[] {
  const target = pickObject(payload);
  const routeTree = Array.isArray(target.routeTree)
    ? target.routeTree
    : parseJsonArray(target.route_tree_json ?? target.routeTreeJson);

  const normalizeRouteNode = (nodePayload: unknown): null | RouteRecordStringComponent => {
    const node = pickObject(nodePayload);
    const path = pickString(node.path);
    const name = pickString(node.name ?? node.code);
    if (!path || !name) {
      return null;
    }
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const children = rawChildren
      .map((child) => normalizeRouteNode(child))
      .filter((child): child is RouteRecordStringComponent => child !== null);
    const rawComponent = pickString(node.component) ?? 'BasicLayout';
    const mappedPath = mapLegacyRoutePath(path);
    const mappedComponent = mapLegacyComponent(rawComponent);

    return {
      ...node,
      component: mappedComponent,
      name,
      path: mappedPath,
      ...(children.length > 0 ? { children } : {}),
      meta: pickObject(node.meta),
    } as RouteRecordStringComponent;
  };

  return routeTree
    .map((item) => normalizeRouteNode(item))
    .filter((item): item is RouteRecordStringComponent => item !== null);
}

function mapLegacyRoutePath(path: string): string {
  const routePathMap: Record<string, string> = {
    '/dashboard': '/analytics',
    '/dashboard/index': '/analytics',
    '/dashboard/analytics': '/analytics',
    '/dashboard/analytics/index': '/analytics',
    '/dashboard/workspace': '/workspace',
    '/dashboard/workspace/index': '/workspace',
    '/devices/list': '/device/list',
    '/diet/meals': '/diet/meal-records',
    '/diet/meal-records': '/diet/meal-records',
    '/diet/recognition-logs': '/diet/recognition-logs',
    '/notification/messages': '/notification/message',
    '/notification/templates': '/notification/template',
    '/notification/device-tokens': '/notification/device-token',
    '/system/admin-users': '/system/user',
    '/system/configs': '/system/config',
    '/system/dictionaries': '/system/dict',
    '/system/menus': '/system/menu',
    '/system/roles': '/system/role',
    '/system/audit-logs': '/system/audit-logs',
  };
  return routePathMap[path] ?? path;
}

function mapLegacyComponent(component: string): string {
  if (component === 'BasicLayout' || component === 'IFrameView') {
    return component;
  }

  const normalized = component.startsWith('/') ? component : `/${component}`;
  const componentMap: Record<string, string> = {
    '/dashboard/index': '/dashboard/analytics/index',
    '/notification/device-token/index': '/notification/device-token/list',
    '/notification/message/index': '/notification/message/list',
    '/notification/template/index': '/notification/template/list',
    '/system/admin-user/index': '/system/user/list',
    '/system/audit-log/index': '/system/audit-log/list',
    '/system/config/index': '/system/config/list',
    '/system/dictionary/index': '/system/dict/list',
    '/system/menu/index': '/system/menu/list',
    '/system/role/index': '/system/role/list',
    '/user/list/index': '/system/user/list',
    '/diet/meal/index': '/diet/meal-record/list',
    '/diet/meal-record/index': '/diet/meal-record/list',
    '/diet/meal-record/list': '/diet/meal-record/list',
    '/diet/recognition-log/index': '/diet/recognition-log/list',
    '/diet/recognition-log/list': '/diet/recognition-log/list',
    '/diet/weighing-record/index': '/diet/meal-records',
    '/diet/weighing-record/list': '/diet/meal-records',
    '/diet/weighing-records': '/diet/meal-records',
    '/diet/food/index': '/_core/fallback/coming-soon',
    '/iot/messages/index': '/iot/messages/list',
    '/iot/recognition-log/index': '/diet/recognition-log/list',
    '/debug-center/index': '/debug-center/index',
  };
  return componentMap[normalized] ?? normalized;
}

function getMenuTreeFromPayload(payload: unknown) {
  const target = pickObject(payload);
  const tree = target.tree;
  if (Array.isArray(tree)) {
    return normalizeMenuTree(tree);
  }
  return normalizeMenuTree(target.tree_json);
}

function getMenuItemsFromPayload(payload: unknown) {
  return normalizeAdminItems(payload).map((item) => normalizeMenuItem(item));
}

function normalizeRoutePath(path: null | string) {
  if (!path) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeComponent(item: MenuApi.MenuItem): string {
  if (item.menuType === 'catalog') {
    return 'BasicLayout';
  }
  if (item.externalLink) {
    return 'IFrameView';
  }
  if (item.component) {
    return item.component.startsWith('/') ? item.component : `/${item.component}`;
  }
  if ((item.children?.length ?? 0) > 0) {
    return 'BasicLayout';
  }
  return 'BasicLayout';
}

function toRouteRecord(item: MenuApi.MenuItem): RouteRecordStringComponent {
  const meta = item.extra ?? {};
  const children = (item.children ?? [])
    .filter((child) => child.menuType !== 'button')
    .map((child) => toRouteRecord(child));

  return {
    name: item.code,
    path: normalizeRoutePath(item.routePath),
    component: normalizeComponent(item),
    ...(children.length > 0 ? { children } : {}),
    meta: {
      ...meta,
      icon: item.icon ?? pickString(meta.icon) ?? undefined,
      keepAlive: item.keepAlive,
      link: pickString(meta.link) ?? item.externalLink ?? undefined,
      menuType: item.menuType,
      order: item.sort,
      permissionCode: item.permissionCode,
      title: item.name,
      hideInMenu: !item.visible,
    },
  };
}

function toMenuPayload(
  data: MenuApi.CreateMenuParams | MenuApi.UpdateMenuParams,
  forCreate: boolean,
) {
  const payload: Record<string, unknown> = {
    component: pickString(data.component),
    externalLink: pickString(data.externalLink),
    extra: pickObject(data.extra),
    icon: pickString(data.icon),
    keepAlive: typeof data.keepAlive === 'boolean' ? data.keepAlive : undefined,
    permissionCode: pickString(data.permissionCode),
    visible: typeof data.visible === 'boolean' ? data.visible : undefined,
  };

  if (forCreate || data.code !== undefined) {
    payload.code = pickString(data.code) ?? '';
  }
  if (forCreate || data.name !== undefined) {
    payload.name = pickString(data.name) ?? '';
  }
  if (forCreate || data.parentId !== undefined) {
    payload.parentId = pickString(data.parentId) ?? '';
  }
  if (forCreate || data.menuType !== undefined) {
    payload.menuType = data.menuType ?? 'menu';
  }
  if (forCreate || data.routePath !== undefined) {
    payload.routePath = pickString(data.routePath) ?? '';
  }
  if (forCreate || data.sort !== undefined) {
    payload.sort = pickNumber(data.sort, 0);
  }

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

async function setMenuStatus(menuId: string, enabled: boolean) {
  return requestClient.request(`/admin/system/menus/${menuId}/status`, {
    data: {
      status: enabled ? 'active' : 'disabled',
    },
    method: 'PATCH',
  });
}

export async function getMenuListApi(params?: { page?: number; pageSize?: number }) {
  const response = await requestClient.get<unknown>('/admin/system/menus', {
    params,
  });
  const items = getMenuItemsFromPayload(response);
  return {
    items,
    total: items.length,
  } satisfies PagedResult<MenuApi.MenuItem>;
}

export async function getMenuTreeApi() {
  const response = await requestClient.get<unknown>('/admin/system/menus');
  return getMenuTreeFromPayload(response);
}

export async function getMenuDetailApi(id: string) {
  const response = await requestClient.get<unknown>(`/admin/system/menus/${id}`);
  return normalizeMenuItem(response);
}

export async function createMenuApi(data: MenuApi.CreateMenuParams) {
  const created = normalizeMenuItem(
    await requestClient.post<unknown>('/admin/system/menus', toMenuPayload(data, true)),
  );
  if (data.status && created.id) {
    await setMenuStatus(created.id, data.status === 'active');
  }
  return created;
}

export async function updateMenuApi(id: string, data: MenuApi.UpdateMenuParams) {
  const updated = normalizeMenuItem(
    await requestClient.request<unknown>(`/admin/system/menus/${id}`, {
      data: toMenuPayload(data, false),
      method: 'PATCH',
    }),
  );
  if (data.status) {
    await setMenuStatus(id, data.status === 'active');
  }
  return updated;
}

export async function deleteMenuApi(id: string) {
  return requestClient.delete(`/admin/system/menus/${id}`);
}

export async function assignRoleMenusApi(roleId: string, data: { menuIds: string[] }) {
  return requestClient.put(`/admin/system/roles/${roleId}/menus`, {
    menuIds: data.menuIds,
  });
}

export async function getRoleMenuIdsApi(roleId: string) {
  const response = await requestClient.get<unknown>(`/admin/system/roles/${roleId}/menus`);
  const target = pickObject(response);
  if (Array.isArray(target.menuIds)) {
    return target.menuIds.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
  }
  return [];
}

export async function getAllMenusApi() {
  const response = await requestClient.get<unknown>('/admin/system/menus/current');
  const routeTree = getRouteTreeFromPayload(response);
  if (routeTree.length > 0) {
    return routeTree;
  }
  const menuTree = getMenuTreeFromPayload(response);
  return menuTree
    .filter((item) => item.menuType !== 'button' && item.status === 'active')
    .map((item) => toRouteRecord(item));
}
