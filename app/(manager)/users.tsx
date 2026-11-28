import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { formatDateTime } from '@/constants/format';
import { useManagerData } from '@/contexts/ManagerDataContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  assignManagerUserBarangay,
  deleteManagerUser,
  updateManagerUserRole,
} from '@/services/managerService';
import { toServiceError } from '@/services/supabase';
import type { ManagerUserRecord, UserRole } from '@/types/database';

type RoleFilter = 'all' | UserRole;

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'resident', label: 'Residents' },
  { key: 'staff', label: 'Staff' },
  { key: 'admin', label: 'Admins' },
];

const ASSIGNABLE_ROLES: { value: UserRole; label: string; description: string }[] = [
  {
    value: 'resident',
    label: 'Resident',
    description: 'Standard resident mobile/web portal for filing document requests.',
  },
  {
    value: 'staff',
    label: 'Barangay Staff',
    description: 'Processes requests, schedules pickups, and verifies QR/payments.',
  },
  {
    value: 'admin',
    label: 'Barangay Admin',
    description: 'Full barangay office controls, GCash QR setup, and local administration.',
  },
];

function RoleBadge({ role, isSelf }: { role: UserRole; isSelf: boolean }) {
  if (isSelf) {
    return (
      <View className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 dark:border-emerald-700 dark:bg-emerald-950">
        <Text className="text-[11px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
          App Manager
        </Text>
      </View>
    );
  }

  const classes =
    role === 'admin'
      ? 'border-primary-200 bg-primary-50 text-primary'
      : role === 'staff'
        ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
        : 'border-border bg-surface-muted text-ink-muted';

  return (
    <View className={`rounded-full border px-2.5 py-0.5 ${classes.split(' ').slice(0, 2).join(' ')}`}>
      <Text className={`text-[11px] font-bold uppercase ${classes.split(' ').slice(2).join(' ')}`}>
        {role}
      </Text>
    </View>
  );
}

export default function ManagerUsersScreen() {
  const { colors, themeVars } = useTheme();
  const { data, loading, refreshing, error, refresh } = useManagerData();

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  // Edit role & barangay modal state
  const [editingUser, setEditingUser] = useState<ManagerUserRecord | null>(null);
  const [draftRole, setDraftRole] = useState<UserRole>('resident');
  const [draftBarangayId, setDraftBarangayId] = useState<string | null>(null);
  const [barangaySearch, setBarangaySearch] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation modal state
  const [deletingUser, setDeletingUser] = useState<ManagerUserRecord | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingBusy, setDeletingBusy] = useState(false);

  const filteredUsers = useMemo(() => {
    const users = data?.users ?? [];
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.barangayName ?? '').toLowerCase().includes(q) ||
        (u.cityMunicipality ?? '').toLowerCase().includes(q)
      );
    });
  }, [data?.users, roleFilter, searchQuery]);

  const filteredModalBarangays = useMemo(() => {
    const all = data?.barangays ?? [];
    const q = barangaySearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.cityMunicipality.toLowerCase().includes(q) ||
        b.province.toLowerCase().includes(q)
    );
  }, [data?.barangays, barangaySearch]);

  function openEditModal(target: ManagerUserRecord) {
    setEditingUser(target);
    setDraftRole(target.role);
    setDraftBarangayId(target.barangayId);
    setBarangaySearch('');
    setFeedback(null);
  }

  function openDeleteModal(target: ManagerUserRecord) {
    setDeletingUser(target);
    setDeleteConfirmText('');
    setFeedback(null);
  }

  async function handleSaveEdit() {
    if (!editingUser) return;
    setSavingEdit(true);
    setFeedback(null);
    try {
      const messages: string[] = [];
      if (draftRole !== editingUser.role) {
        const res = await updateManagerUserRole(editingUser.id, draftRole);
        messages.push(res.message);
      }
      if (draftBarangayId !== editingUser.barangayId) {
        const res = await assignManagerUserBarangay(editingUser.id, draftBarangayId);
        messages.push(res.message);
      }

      if (messages.length > 0) {
        await refresh({ silent: true });
        setFeedback({ tone: 'success', message: messages.join(' ') });
      }
      setEditingUser(null);
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: toServiceError(err, 'Unable to update user settings.').message,
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingUser) return;
    setDeletingBusy(true);
    setFeedback(null);
    try {
      const res = await deleteManagerUser(deletingUser.id, deleteConfirmText);
      await refresh({ silent: true });
      setFeedback({
        tone: 'success',
        message: `${res.message} (${res.deletedRequestsCount ?? 0} request(s), ${res.deletedAttachmentsCount ?? 0} file(s) purged.)`,
      });
      setDeletingUser(null);
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: toServiceError(err, 'Unable to delete account.').message,
      });
    } finally {
      setDeletingBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <View className="flex-1 p-6">
        <LoadingState message="Loading account directory..." />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-surface-muted"
        contentContainerStyle={{ padding: 20, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh({ silent: true })}
            tintColor={colors.primary}
          />
        }
      >
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold text-ink">User &amp; Role Management</Text>
            <Text className="text-sm text-ink-muted">
              Assign roles or barangay affiliations without exposing personal addresses or IDs.
            </Text>
          </View>
          <Button
            label="Refresh"
            variant="outline"
            size="sm"
            icon="refresh"
            loading={refreshing}
            onPress={() => void refresh({ silent: true })}
          />
        </View>

        <Banner
          tone="info"
          message="RA 10173 Minimization: Residential street addresses, personal phone numbers, uploaded IDs, and request contents are omitted from this view."
        />

        {error ? <Banner tone="error" message={error} /> : null}
        {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

        <Card>
          <View className="gap-3">
            <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface-muted px-3.5 py-2.5">
              <MaterialIcons name="search" size={18} color={colors.inkSubtle} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name, email, or barangay..."
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="none"
                className="flex-1 p-0 text-sm text-ink"
                accessibilityLabel="Search users"
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>

            <View className="flex-row flex-wrap gap-2">
              {ROLE_FILTERS.map((filter) => {
                const active = roleFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setRoleFilter(filter.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`rounded-full border px-3.5 py-1.5 ${
                      active
                        ? 'border-primary bg-primary-50'
                        : 'border-border bg-surface-muted'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        active ? 'text-primary' : 'text-ink-muted'
                      }`}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>

        {filteredUsers.length === 0 ? (
          <EmptyState
            icon="people"
            title="No matching accounts"
            description="Try adjusting your search query or role filter."
          />
        ) : (
          <View className="gap-3">
            {filteredUsers.map((account) => (
              <View
                key={account.id}
                className="gap-3 rounded-card border border-border bg-surface p-4"
              >
                <View className="flex-row flex-wrap items-start justify-between gap-2">
                  <View className="min-w-[200px] flex-1 gap-1">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="text-base font-bold text-ink">{account.fullName}</Text>
                      <RoleBadge role={account.role} isSelf={account.isSelf} />
                      <View
                        className={`rounded-full px-2 py-0.5 ${
                          account.emailConfirmed
                            ? 'bg-emerald-50 dark:bg-emerald-950/60'
                            : 'bg-amber-50 dark:bg-amber-950/60'
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-bold uppercase ${
                            account.emailConfirmed
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : 'text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {account.emailConfirmed ? 'Email Verified' : 'Unverified'}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-sm text-ink-muted">
                      {account.email ?? 'No email available'}
                    </Text>
                  </View>

                  {!account.isSelf ? (
                    <View className="flex-row flex-wrap gap-2">
                      <Button
                        label="Role & Barangay"
                        size="sm"
                        variant="secondary"
                        icon="edit"
                        onPress={() => openEditModal(account)}
                      />
                      <Button
                        label="Delete"
                        size="sm"
                        variant="danger"
                        icon="delete-outline"
                        onPress={() => openDeleteModal(account)}
                      />
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-1 rounded-lg border border-border bg-surface-muted px-2.5 py-1.5">
                      <MaterialIcons name="lock" size={14} color={colors.inkSubtle} />
                      <Text className="text-xs font-semibold text-ink-subtle">Protected</Text>
                    </View>
                  )}
                </View>

                <View className="flex-row flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2.5">
                  <Text className="text-xs text-ink-muted">
                    Barangay:{' '}
                    <Text className="font-semibold text-ink">
                      {account.barangayName
                        ? `${account.barangayName}${
                            account.cityMunicipality ? `, ${account.cityMunicipality}` : ''
                          }`
                        : 'Unassigned'}
                    </Text>
                  </Text>
                  <Text className="text-xs text-ink-muted">
                    Registered:{' '}
                    <Text className="font-semibold text-ink">
                      {formatDateTime(account.createdAt)}
                    </Text>
                  </Text>
                  <Text className="text-xs text-ink-muted">
                    RA 10173 Consent:{' '}
                    <Text className="font-semibold text-ink">
                      {account.privacyConsentAt
                        ? formatDateTime(account.privacyConsentAt)
                        : 'Pending'}
                    </Text>
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit Role & Barangay Modal */}
      <Modal
        visible={Boolean(editingUser)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!savingEdit) setEditingUser(null);
        }}
      >
        <View
          style={themeVars}
          className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
        >
          <View className="max-h-[90%] w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <View className="flex-1 gap-0.5 pr-2">
                <Text className="text-base font-bold text-ink">Manage Account Access</Text>
                <Text className="text-xs text-ink-muted" numberOfLines={1}>
                  {editingUser?.fullName} ({editingUser?.email ?? '—'})
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (!savingEdit) setEditingUser(null);
                }}
                hitSlop={8}
                className="rounded-full p-1"
              >
                <MaterialIcons name="close" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator>
              <View className="gap-5 p-5">
                <View className="gap-2">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Account Role
                  </Text>
                  <View className="gap-2">
                    {ASSIGNABLE_ROLES.map((item) => {
                      const active = draftRole === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          onPress={() => setDraftRole(item.value)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          className={`gap-0.5 rounded-xl border px-3.5 py-3 ${
                            active
                              ? 'border-primary bg-primary-50'
                              : 'border-border bg-surface-muted'
                          }`}
                        >
                          <Text
                            className={`text-sm font-bold ${
                              active ? 'text-primary' : 'text-ink'
                            }`}
                          >
                            {item.label}
                          </Text>
                          <Text className="text-xs text-ink-muted">{item.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View className="gap-2">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Assigned Barangay Office
                  </Text>
                  <TextInput
                    value={barangaySearch}
                    onChangeText={setBarangaySearch}
                    placeholder="Filter registered barangays..."
                    placeholderTextColor={colors.inkSubtle}
                    className="rounded-xl border border-border bg-surface-input px-3.5 py-2.5 text-sm text-ink"
                  />
                  <View className="max-h-48 overflow-hidden rounded-xl border border-border bg-surface-muted">
                    <ScrollView nestedScrollEnabled>
                      <Pressable
                        onPress={() => setDraftBarangayId(null)}
                        className={`border-b border-border px-3.5 py-2.5 ${
                          draftBarangayId === null ? 'bg-primary-50' : ''
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            draftBarangayId === null ? 'text-primary' : 'text-ink-muted'
                          }`}
                        >
                          Unassigned (No Barangay)
                        </Text>
                      </Pressable>
                      {filteredModalBarangays.map((b) => {
                        const selected = draftBarangayId === b.id;
                        return (
                          <Pressable
                            key={b.id}
                            onPress={() => setDraftBarangayId(b.id)}
                            className={`border-b border-border px-3.5 py-2.5 ${
                              selected ? 'bg-primary-50' : ''
                            }`}
                          >
                            <Text
                              className={`text-sm font-semibold ${
                                selected ? 'text-primary' : 'text-ink'
                              }`}
                            >
                              {b.name}
                            </Text>
                            <Text className="text-xs text-ink-subtle">
                              {b.cityMunicipality}
                              {b.province ? `, ${b.province}` : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>

                <View className="flex-row justify-end gap-2.5">
                  <Button
                    label="Cancel"
                    variant="outline"
                    size="sm"
                    disabled={savingEdit}
                    onPress={() => setEditingUser(null)}
                  />
                  <Button
                    label="Save Changes"
                    variant="primary"
                    size="sm"
                    loading={savingEdit}
                    onPress={() => void handleSaveEdit()}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Permanent Account Deletion Modal */}
      <Modal
        visible={Boolean(deletingUser)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingBusy) setDeletingUser(null);
        }}
      >
        <View
          style={themeVars}
          className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
        >
          <View className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-red-700 dark:text-red-400">
                Delete Account Permanently
              </Text>
              <Pressable
                onPress={() => {
                  if (!deletingBusy) setDeletingUser(null);
                }}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>

            <View className="gap-4">
              <Text className="text-sm leading-5 text-ink-muted">
                You are about to permanently remove{' '}
                <Text className="font-bold text-ink">{deletingUser?.fullName}</Text> (
                {deletingUser?.email ?? 'no email'}). All private uploaded requirement files and
                account data will be purged under RA 10173 right-to-erasure rules, leaving only a
                PII-free audit log.
              </Text>

              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-ink">
                  Type <Text className="font-extrabold">DELETE</Text> to confirm:
                </Text>
                <TextInput
                  value={deleteConfirmText}
                  onChangeText={setDeleteConfirmText}
                  placeholder="DELETE"
                  placeholderTextColor={colors.inkSubtle}
                  autoCapitalize="characters"
                  editable={!deletingBusy}
                  className="rounded-xl border border-border-strong bg-surface-input px-3.5 py-2.5 text-sm font-bold text-ink"
                />
              </View>

              <View className="flex-row justify-end gap-2.5">
                <Button
                  label="Cancel"
                  variant="outline"
                  size="sm"
                  disabled={deletingBusy}
                  onPress={() => setDeletingUser(null)}
                />
                <Button
                  label="Delete Permanently"
                  variant="danger"
                  size="sm"
                  icon="delete-outline"
                  loading={deletingBusy}
                  disabled={deleteConfirmText.trim() !== 'DELETE'}
                  onPress={() => void handleConfirmDelete()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
