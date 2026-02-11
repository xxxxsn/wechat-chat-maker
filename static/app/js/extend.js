/**
 * Vue 无源码扩展入口（仅 dist 时使用）
 * 在 chat.bundle.js 加载后、Vue 挂载完成后执行，通过 #vueApp.__vue__ 拿到根实例并注入数据/方法。
 * 新增功能时：在此文件里给 app 挂方法、用 Vue.set 加响应式数据，在 index.html 里加对应 HTML 和 v-model/@click 等。
 */
(function () {
	'use strict';

	function getVueApp() {
		var el = document.getElementById('vueApp');
		return el && el.__vue__ ? el.__vue__ : null;
	}

	/**
	 * 等待 Vue 根实例就绪后执行扩展（可多次调用，用于重试）
	 * @param {Function} extend - function(app, Vue) { ... }
	 * @param {number} delay - 延迟毫秒
	 * @param {number} maxRetry - 最大重试次数
	 */
	function whenReady(extend, delay, maxRetry) {
		delay = delay || 300;
		maxRetry = maxRetry || 20;
		var tried = 0;

		function run() {
			var app = getVueApp();
			if (app && app.setting != null) {
				extend(app, app.constructor);
				return;
			}
			tried += 1;
			if (tried < maxRetry) setTimeout(run, delay);
		}

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', function () { setTimeout(run, delay); });
		} else {
			setTimeout(run, delay);
		}
	}

	/**
	 * 已注入标记，避免重复执行
	 */
	var INJECTED_KEY = '_extendInjected';

	whenReady(function (app, Vue) {
		if (app[INJECTED_KEY]) return;
		app[INJECTED_KEY] = true;

		// ---------- 1. 图文链接对话扩展 ----------
		// 先注入方法和数据，再设置 _linkReady，这样 v-if="setting._linkReady" 的块首次渲染时方法已存在，避免 ReferenceError
		Vue.set(app.setting, 'dialog_link_title', '');
		Vue.set(app.setting, 'dialog_link_content', '');
		Vue.set(app.setting, 'dialog_link_image', '');
		Vue.set(app.setting, 'dialog_link_footer', '');
		Vue.set(app.setting, 'dialog_link_footer_icon', '');

		// 截断并追加「...」，用真实文本便于截图时显示省略号（CSS ellipsis 在 html2canvas 中可能不渲染）
		app.linkTruncate = function (str, maxLen) {
			if (str == null || str === '') return '';
			var s = String(str);
			return s.length <= maxLen ? s : s.slice(0, maxLen) + '...';
		};

		// 图文主图上传
		app.onLinkImageChange = function (e) {
			var file = e.target && e.target.files[0];
			if (!file) return;
			var reader = new FileReader();
			reader.onload = function (ev) {
				app.setting.dialog_link_image = ev.target.result;
			};
			reader.readAsDataURL(file);
			e.target.value = '';
		};

		// 底部圆形图标上传
		app.onLinkFooterIconChange = function (e) {
			var file = e.target && e.target.files[0];
			if (!file) return;
			var reader = new FileReader();
			reader.onload = function (ev) {
				app.setting.dialog_link_footer_icon = ev.target.result;
			};
			reader.readAsDataURL(file);
			e.target.value = '';
		};

		app.addLinkDialog = function () {
			var title = (app.setting.dialog_link_title || '').trim();
			var content = (app.setting.dialog_link_content || '').trim();
			var image = app.setting.dialog_link_image;
			var footer = (app.setting.dialog_link_footer || '').trim();
			var footerIcon = app.setting.dialog_link_footer_icon;

			// 五个字段都必填（含图文内容）
			if (!title || !content || !image || !footer || !footerIcon) {
				alert('请先填写图文标题、图文内容、选择缩略图、底部文案和底部图标。');
				return;
			}

			var idx = app.users && app.users.findIndex(function (u) { return u.selected; });
			if (idx < 0) idx = 0;
			var isMe = idx === 0;
			var userId = (app.users[idx] && app.users[idx].id !== undefined) ? app.users[idx].id : idx;
			app.dialogs.push({
				type: 'link',
				title: title,
				link_content: content,
				image: image,
				footer: footer,
				footer_icon: footerIcon,
				user_id: userId,
				is_me: isMe
			});
		};

		// 供模板内 onclick/onchange 调用的全局函数（模板不写 @click="addLinkDialog" 可避免编译期 ReferenceError）
		window.__addLinkDialog = function () {
			var a = getVueApp();
			if (a && a.addLinkDialog) a.addLinkDialog();
		};
		window.__onLinkImageChange = function (e) {
			var a = getVueApp();
			if (a && a.onLinkImageChange) a.onLinkImageChange(e);
		};
		window.__onLinkFooterIconChange = function (e) {
			var a = getVueApp();
			if (a && a.onLinkFooterIconChange) a.onLinkFooterIconChange(e);
		};
		// 延后显示图文表单，确保 _linkReady 为 true 时上述全局已挂好
		Vue.set(app.setting, '_linkReady', true);

		// 本地缓存：对话列表 + 图文表单四个字段
		var STORAGE_KEY = 'wechat_dialogs';
		var LINK_FORM_KEY = 'wechat_link_form';
		function getStorage() {
			if (typeof window.localforage !== 'undefined') {
				return window.localforage;
			}
			return {
				getItem: function (k) { return Promise.resolve(localStorage.getItem(k)); },
				setItem: function (k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return Promise.resolve(); } catch (e) { return Promise.reject(e); } }
			};
		}
		function saveDialogsToCache() {
			var list = app.dialogs && app.dialogs.slice ? app.dialogs.slice() : [];
			getStorage().setItem(STORAGE_KEY, list).catch(function () {});
		}
		function saveLinkFormToCache() {
			var form = {
				dialog_link_title: app.setting.dialog_link_title || '',
				dialog_link_content: app.setting.dialog_link_content || '',
				dialog_link_image: app.setting.dialog_link_image || '',
				dialog_link_footer: app.setting.dialog_link_footer || '',
				dialog_link_footer_icon: app.setting.dialog_link_footer_icon || ''
			};
			getStorage().setItem(LINK_FORM_KEY, form).catch(function () {});
		}
		function restoreDialogsFromCache() {
			getStorage().getItem(STORAGE_KEY).then(function (data) {
				var list = data;
				if (typeof list === 'string') try { list = JSON.parse(list); } catch (e) { return; }
				if (!Array.isArray(list) || list.length === 0) return;
				app.dialogs.splice(0, app.dialogs.length, ...list);
			}).catch(function () {});
		}
		function restoreLinkFormFromCache() {
			getStorage().getItem(LINK_FORM_KEY).then(function (data) {
				var form = data;
				if (typeof form === 'string') try { form = JSON.parse(form); } catch (e) { form = null; }
				if (form && typeof form === 'object') {
					if (form.dialog_link_title != null) Vue.set(app.setting, 'dialog_link_title', form.dialog_link_title);
					if (form.dialog_link_content != null) Vue.set(app.setting, 'dialog_link_content', form.dialog_link_content);
					if (form.dialog_link_image != null) Vue.set(app.setting, 'dialog_link_image', form.dialog_link_image || '');
					if (form.dialog_link_footer != null) Vue.set(app.setting, 'dialog_link_footer', form.dialog_link_footer);
					if (form.dialog_link_footer_icon != null) Vue.set(app.setting, 'dialog_link_footer_icon', form.dialog_link_footer_icon || '');
					return;
				}
				// 若未存过表单缓存：用对话列表里最后一条 link 消息回填表单
				var list = app.dialogs || [];
				for (var i = list.length - 1; i >= 0; i--) {
					if (list[i] && list[i].type === 'link') {
						Vue.set(app.setting, 'dialog_link_title', list[i].title || '');
						Vue.set(app.setting, 'dialog_link_content', list[i].link_content || '');
						Vue.set(app.setting, 'dialog_link_image', list[i].image || '');
						Vue.set(app.setting, 'dialog_link_footer', list[i].footer || '');
						Vue.set(app.setting, 'dialog_link_footer_icon', list[i].footer_icon || '');
						break;
					}
				}
			}).catch(function () {});
		}
		// 延后恢复对话列表
		setTimeout(restoreDialogsFromCache, 100);
		// 延后恢复图文表单四个字段（标题、缩略图、底部文案、底部图标）
		setTimeout(restoreLinkFormFromCache, 150);
		// 添加 link 后写入对话缓存，并保存当前表单到 wechat_link_form 供刷新回显
		var rawAddLink = app.addLinkDialog;
		app.addLinkDialog = function () {
			rawAddLink.call(app);
			saveDialogsToCache();
			saveLinkFormToCache();
		};
		window.__saveWechatDialogs = saveDialogsToCache;

		// ---------- 2. 在此继续挂载更多方法、用 Vue.set 添加响应式数据 ----------
		// 示例：添加新数据
		// Vue.set(app, 'myFlag', false);
		// 示例：添加新方法
		// app.myNewMethod = function () { ... };
	});

	// 暴露给控制台调试用（可选）
	window.getVueApp = getVueApp;
})();
