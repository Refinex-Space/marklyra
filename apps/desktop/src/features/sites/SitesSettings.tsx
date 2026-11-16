import { useState } from 'react';
import {
  Button,
  Card,
  Row,
  Segmented,
  Select,
  Switch,
  TextField,
} from '../export/settings/controls.js';
import { usePreferences } from '../settings/usePreferences.js';
import {
  keywordProblem,
  MAX_ENGINES,
  type SearchEngine,
  templateProblem,
} from './model/engines.js';
import type { SitesPreferences, SitesView } from './sites-preferences.js';
import '../export/settings/export-settings.css';
import './sites-settings.css';

/** 站点导航 settings: stored with the shell preferences, so every window follows at once. */
export function SitesSettings({ dark }: { dark: boolean }) {
  const [preferences, setPreferences] = usePreferences();
  const sites = preferences.sites;
  const update = (change: Partial<SitesPreferences>) =>
    setPreferences((current) => ({ ...current, sites: { ...current.sites, ...change } }));
  const off = !sites.enabled;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({ name: '', template: '', keyword: '' });
  const [adding, setAdding] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const setEngines = (engines: SearchEngine[]) =>
    update({
      engines,
      engine: engines.some((e) => e.id === sites.engine)
        ? sites.engine
        : (engines[0]?.id ?? 'bing'),
    });
  const fail = (key: string, message: string | null) =>
    setErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  const edit = (engine: SearchEngine, field: 'name' | 'template' | 'keyword', value: string) => {
    const key = `${engine.id}:${field}`;
    const text = value.trim();
    const others = sites.engines.filter((e) => e.id !== engine.id).map((e) => e.keyword);
    const problem =
      field === 'name'
        ? text
          ? null
          : '名称不能为空'
        : field === 'template'
          ? templateProblem(text)
          : keywordProblem(text, others);
    fail(key, problem);
    if (problem) return;
    setEngines(sites.engines.map((e) => (e.id === engine.id ? { ...e, [field]: text } : e)));
  };
  const add = () => {
    const name = draft.name.trim();
    const problem =
      sites.engines.length >= MAX_ENGINES
        ? `最多添加 ${MAX_ENGINES - 2} 个自定义引擎`
        : !name
          ? '请输入名称'
          : (templateProblem(draft.template) ??
            keywordProblem(
              draft.keyword.trim(),
              sites.engines.map((e) => e.keyword),
            ));
    setAdding(problem);
    if (problem) return;
    setEngines([
      ...sites.engines,
      {
        id: `custom-${Date.now().toString(36)}`,
        name,
        template: draft.template.trim(),
        keyword: draft.keyword.trim(),
        builtin: false,
      },
    ]);
    setDraft({ name: '', template: '', keyword: '' });
    setFormOpen(false);
  };

  return (
    <section className="es" aria-label="站点导航设置" data-dark={dark}>
      <div className="es-scroll">
        <div className="es-content">
          <header className="es-heading">
            <div>
              <h1>站点导航</h1>
              <p>收藏常用网址并按分组整理；顶部搜索框直接交给默认浏览器搜索或打开网址。</p>
            </div>
          </header>
          <Card>
            <Row
              label="在标题栏显示站点导航"
              hint="关闭后标题栏不再显示入口；已收藏的站点仍保存在各文件夹的 .marklyra/sites 中。"
            >
              <Switch
                label="在标题栏显示站点导航"
                checked={sites.enabled}
                onChange={(enabled) => update({ enabled })}
              />
            </Row>
          </Card>
          <Card
            title="搜索"
            description="关键词放在搜索词前（例如“g 关键词”），只在这一次搜索中使用对应的引擎。"
          >
            <Row label="默认搜索引擎" hint="在搜索框里按 Tab 可以临时换一个，不会改变这里的选择。">
              <Select
                label="默认搜索引擎"
                value={sites.engine}
                disabled={off}
                options={sites.engines.map((e) => ({ value: e.id, label: e.name }))}
                onChange={(engine) => update({ engine })}
              />
            </Row>
            {sites.engines.map((engine) => (
              <div key={engine.id}>
                {engine.builtin ? (
                  <Row label={engine.name} hint={engine.template}>
                    <span className="sites-keyword">
                      <TextField
                        label={`${engine.name}的关键词`}
                        value={engine.keyword}
                        disabled={off}
                        maxLength={8}
                        invalid={!!errors[`${engine.id}:keyword`]}
                        onCommit={(value) => edit(engine, 'keyword', value)}
                      />
                    </span>
                  </Row>
                ) : (
                  <>
                    <Row label="名称">
                      <TextField
                        label={`${engine.name}的名称`}
                        value={engine.name}
                        disabled={off}
                        maxLength={24}
                        invalid={!!errors[`${engine.id}:name`]}
                        onCommit={(value) => edit(engine, 'name', value)}
                      />
                    </Row>
                    <Row label="搜索地址" hint="用 %s 表示搜索词，必须是 https 地址。">
                      <TextField
                        label={`${engine.name}的搜索地址`}
                        value={engine.template}
                        disabled={off}
                        mono
                        invalid={!!errors[`${engine.id}:template`]}
                        onCommit={(value) => edit(engine, 'template', value)}
                      />
                    </Row>
                    <Row label="关键词">
                      <span className="sites-keyword">
                        <TextField
                          label={`${engine.name}的关键词`}
                          value={engine.keyword}
                          disabled={off}
                          maxLength={8}
                          invalid={!!errors[`${engine.id}:keyword`]}
                          onCommit={(value) => edit(engine, 'keyword', value)}
                        />
                      </span>
                    </Row>
                    <Row label="">
                      <Button
                        kind="danger"
                        disabled={off}
                        label={`删除搜索引擎：${engine.name}`}
                        onClick={() => setEngines(sites.engines.filter((e) => e.id !== engine.id))}
                      >
                        删除
                      </Button>
                    </Row>
                  </>
                )}
                {Object.entries(errors)
                  .filter(([key]) => key.startsWith(`${engine.id}:`))
                  .map(([key, message]) => (
                    <p key={key} className="es-field-error" role="alert">
                      {message}
                    </p>
                  ))}
              </div>
            ))}
            {formOpen ? (
              <div className="sites-engine-add">
                <Row label="名称">
                  <TextField
                    label="新搜索引擎的名称"
                    value={draft.name}
                    disabled={off}
                    maxLength={24}
                    onCommit={(name) => setDraft((d) => ({ ...d, name }))}
                  />
                </Row>
                <Row label="搜索地址" hint="用 %s 表示搜索词，例如 https://duckduckgo.com/?q=%s">
                  <TextField
                    label="新搜索引擎的搜索地址"
                    value={draft.template}
                    disabled={off}
                    mono
                    onCommit={(template) => setDraft((d) => ({ ...d, template }))}
                  />
                </Row>
                <Row label="关键词" hint="1–8 位小写字母或数字。">
                  <span className="sites-keyword">
                    <TextField
                      label="新搜索引擎的关键词"
                      value={draft.keyword}
                      disabled={off}
                      maxLength={8}
                      onCommit={(keyword) => setDraft((d) => ({ ...d, keyword }))}
                    />
                  </span>
                </Row>
                {adding && (
                  <p className="es-field-error" role="alert">
                    {adding}
                  </p>
                )}
                <div className="sites-engine-add-actions">
                  <Button
                    disabled={off}
                    onClick={() => {
                      setFormOpen(false);
                      setAdding(null);
                      setDraft({ name: '', template: '', keyword: '' });
                    }}
                  >
                    取消
                  </Button>
                  <Button kind="primary" disabled={off} onClick={add}>
                    添加
                  </Button>
                </div>
              </div>
            ) : (
              <div className="sites-engine-add-actions">
                <Button disabled={off} onClick={() => setFormOpen(true)}>
                  添加搜索引擎…
                </Button>
              </div>
            )}
          </Card>
          <Card title="站点信息">
            <Row label="添加站点时自动获取标题、描述和图标">
              <Switch
                label="添加站点时自动获取标题、描述和图标"
                checked={sites.fetchMetadata}
                disabled={off}
                onChange={(fetchMetadata) => update({ fetchMetadata })}
              />
            </Row>
            <Row label="图标补充来源" hint="开启后，站点自己的图标取不到时，会把域名发给所选服务。">
              <Segmented
                label="图标补充来源"
                value={sites.thirdPartyIcons}
                disabled={off}
                options={[
                  { value: 'off', label: '关闭' },
                  { value: 'duckduckgo', label: 'DuckDuckGo' },
                  { value: 'google', label: 'Google' },
                ]}
                onChange={(thirdPartyIcons) => update({ thirdPartyIcons })}
              />
            </Row>
          </Card>
          <Card title="显示">
            <Row label="默认视图">
              <Segmented<SitesView>
                label="默认视图"
                value={sites.view}
                disabled={off}
                options={[
                  { value: 'cards', label: '卡片' },
                  { value: 'list', label: '列表' },
                ]}
                onChange={(view) => update({ view })}
              />
            </Row>
            <Row label="在搜索框下方显示常用站点">
              <Switch
                label="在搜索框下方显示常用站点"
                checked={sites.showPinned}
                disabled={off}
                onChange={(showPinned) => update({ showPinned })}
              />
            </Row>
          </Card>
        </div>
      </div>
    </section>
  );
}
