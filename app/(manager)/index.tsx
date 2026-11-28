import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { formatAuditAction, formatDateTime } from '@/constants/format';
import { useManagerData } from '@/contexts/ManagerDataContext';
import { useTheme } from '@/contexts/ThemeContext';

function MetricTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number;
  hint: string;
  tone?: 'default' | 'primary' | 'warning' | 'success';
}) {
  const toneClasses = {
    default: 'border-border bg-surface',
    primary: 'border-primary-200 bg-primary-50/60',
    warning: 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/40',
    success: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/40',
  }[tone];

  return (
    <View className={`min-w-[160px] flex-1 gap-1 rounded-card border p-4 ${toneClasses}`}>
      <Text className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
        {label}
      </Text>
      <Text className="text-2xl font-extrabold text-ink">{value}</Text>
      <Text className="text-xs text-ink-muted">{hint}</Text>
    </View>
  );
}

export default function ManagerOverviewScreen() {
  const { colors } = useTheme();
  const { data, loading, refreshing, error, refresh } = useManagerData();

  if (loading && !data) {
    return (
      <View className="flex-1 p-6">
        <LoadingState message="Loading App Manager overview..." />
      </View>
    );
  }

  return (
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
          <Text className="text-2xl font-extrabold text-ink">Platform Control Plane</Text>
          <Text className="text-sm text-ink-muted">
            Exclusive system administration for {data?.managerEmail ?? 'docudash.app@gmail.com'}
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

      {error ? (
        <Banner
          tone="error"
          title="Unable to sync platform data"
          message={error}
          actionLabel="Retry"
          onAction={() => void refresh()}
        />
      ) : null}

      {/* RA 10173 Data Minimization Guarantee */}
      <View className="flex-row items-start gap-3 rounded-card border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
        <MaterialIcons
          name="verified-user"
          size={22}
          color={colors.success}
          style={{ marginTop: 2 }}
        />
        <View className="flex-1 gap-1">
          <Text className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            RA 10173 Privacy-by-Design Boundary Active
          </Text>
          <Text className="text-xs leading-5 text-emerald-800 dark:text-emerald-300">
            In compliance with the Philippine Data Privacy Act of 2012, the App Manager interface
            intentionally omits residential addresses, personal contact numbers, uploaded government
            IDs, request purposes, QR pickup tokens, and resident GCash payment proofs. Only
            account governance, barangay onboarding, document catalog settings, and aggregate
            telemetry are accessible here.
          </Text>
        </View>
      </View>

      {data ? (
        <>
          {/* Core Metrics */}
          <View className="flex-row flex-wrap gap-3">
            <MetricTile
              label="Total Accounts"
              value={data.metrics.totalUsers}
              hint={`${data.metrics.residentCount} resident · ${data.metrics.staffCount} staff · ${data.metrics.adminCount} admin`}
              tone="primary"
            />
            <MetricTile
              label="Pending Admin Requests"
              value={data.metrics.pendingAdminRequests}
              hint="Awaiting barangay onboarding review"
              tone={data.metrics.pendingAdminRequests > 0 ? 'warning' : 'default'}
            />
            <MetricTile
              label="Active Barangays"
              value={data.metrics.activeBarangays}
              hint={`${data.metrics.totalBarangays} total registered LGU offices`}
              tone="success"
            />
            <MetricTile
              label="Aggregate Requests"
              value={data.metrics.requestCounts.total}
              hint={`${data.metrics.requestCounts.pending + data.metrics.requestCounts.reviewing} in review · ${data.metrics.requestCounts.ready} ready · ${data.metrics.requestCounts.completed} released`}
            />
          </View>

          {/* Quick Actions */}
          <Card
            title="Management Modules"
            subtitle="Choose a workspace to administer accounts, onboarding, or compliance."
          >
            <View className="flex-row flex-wrap gap-2.5">
              <Button
                label="Manage Users & Roles"
                icon="manage-accounts"
                variant="primary"
                size="sm"
                onPress={() => router.replace('/(manager)/users')}
              />
              <Button
                label={`Barangay Requests (${data.metrics.pendingAdminRequests})`}
                icon="account-balance"
                variant="secondary"
                size="sm"
                onPress={() => router.replace('/(manager)/barangays')}
              />
              <Button
                label="Catalog & Retention Purge"
                icon="cleaning-services"
                variant="outline"
                size="sm"
                onPress={() => router.replace('/(manager)/system')}
              />
            </View>
          </Card>

          {/* Aggregate Request Pipeline Telemetry */}
          <Card
            title="Aggregate Document Volume (PII-Free)"
            subtitle="Counts only — individual resident request records remain isolated to each barangay."
          >
            <View className="flex-row flex-wrap gap-2">
              {(
                [
                  ['Pending', data.metrics.requestCounts.pending],
                  ['Reviewing', data.metrics.requestCounts.reviewing],
                  ['Ready for Pickup', data.metrics.requestCounts.ready],
                  ['Completed', data.metrics.requestCounts.completed],
                  ['Rejected', data.metrics.requestCounts.rejected],
                ] as const
              ).map(([label, count]) => (
                <View
                  key={label}
                  className="min-w-[110px] flex-1 rounded-xl border border-border bg-surface-muted px-3.5 py-2.5"
                >
                  <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                    {label}
                  </Text>
                  <Text className="mt-0.5 text-lg font-extrabold text-ink">{count}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* PII-Free Audit Trail */}
          <Card
            title="Recent Platform Audit Trail"
            subtitle="Append-only, PII-free operational events (latest 50)."
          >
            {data.auditLogs.length === 0 ? (
              <EmptyState
                icon="history"
                title="No audit events yet"
                description="Administrative and compliance events will appear here once recorded."
              />
            ) : (
              <View className="gap-2.5">
                {data.auditLogs.map((entry) => {
                  const metaPairs = Object.entries(entry.metadata ?? {}).filter(
                    ([, val]) => val !== undefined && val !== null && val !== ''
                  );
                  return (
                    <View
                      key={entry.id}
                      className="gap-1.5 rounded-xl border border-border bg-surface-muted px-3.5 py-3"
                    >
                      <View className="flex-row flex-wrap items-center justify-between gap-2">
                        <Text className="text-sm font-semibold text-ink">
                          {formatAuditAction(entry.action)}
                        </Text>
                        <Text className="text-xs text-ink-subtle">
                          {formatDateTime(entry.createdAt)}
                        </Text>
                      </View>
                      {metaPairs.length > 0 ? (
                        <View className="flex-row flex-wrap gap-1.5">
                          {metaPairs.map(([key, value]) => (
                            <View
                              key={key}
                              className="rounded-md border border-border bg-surface px-2 py-0.5"
                            >
                              <Text className="text-[11px] text-ink-muted">
                                {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}
