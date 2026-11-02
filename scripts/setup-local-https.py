#!/usr/bin/env python3
"""Prepare a project-local CA, TLS certificate, and iPad certificate-only profile.

Does not install trust, contact any cloud service, or edit the application build.
"""
import argparse
import hashlib
import html
import ipaddress
import json
import os
from pathlib import Path
import plistlib
import secrets
import subprocess
import uuid


def run(*args):
    result = subprocess.run(['openssl', *map(str, args)], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


parser = argparse.ArgumentParser()
parser.add_argument('--ip', required=True, help='Current private Wi-Fi IPv4 address of this Mac')
args = parser.parse_args()
address = ipaddress.ip_address(args.ip)
if address.version != 4 or not address.is_private or address.is_loopback:
    parser.error('Use the current private Wi-Fi IPv4 address, not a public or loopback address.')

os.umask(0o077)
root = Path(__file__).resolve().parent.parent
local = root / '.local-https'
public = local / 'public'
public.mkdir(parents=True, exist_ok=True)
local.chmod(0o700)

ca_key = local / 'ca-key.pem'
ca_cert = local / 'ca.pem'
if ca_key.exists() != ca_cert.exists():
    raise RuntimeError('Incomplete existing CA; preserving it for inspection instead of replacing it.')
if not ca_cert.exists():
    run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365',
        '-subj', '/CN=77 Local Test CA/O=77 Local Preview',
        '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
        '-addext', 'subjectKeyIdentifier=hash',
        '-keyout', ca_key, '-out', ca_cert)
ca_key.chmod(0o600)
run('x509', '-in', ca_cert, '-checkend', '86400', '-noout')

server_key = local / 'server-key.pem'
server_cert = local / 'server.pem'
config_path = local / 'config.json'
old = json.loads(config_path.read_text()) if config_path.exists() else {}
if old.get('lanAddress') != str(address) or not server_cert.exists() or not server_key.exists():
    extensions = local / 'server-extensions.cnf'
    extensions.write_text(
        'basicConstraints=critical,CA:FALSE\n'
        'keyUsage=critical,digitalSignature,keyEncipherment\n'
        'extendedKeyUsage=serverAuth\n'
        f'subjectAltName=IP:{address},IP:127.0.0.1,DNS:localhost\n'
        'subjectKeyIdentifier=hash\n'
        'authorityKeyIdentifier=keyid,issuer\n'
    )
    csr = local / 'server.csr'
    run('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256',
        '-subj', '/CN=77 Local Preview/O=77 Local Preview', '-keyout', server_key, '-out', csr)
    run('x509', '-req', '-in', csr, '-CA', ca_cert, '-CAkey', ca_key,
        '-set_serial', '0x' + secrets.token_hex(16), '-days', '90', '-sha256',
        '-extfile', extensions, '-out', server_cert)
server_key.chmod(0o600)
run('verify', '-CAfile', ca_cert, '-purpose', 'sslserver', server_cert)
run('x509', '-in', server_cert, '-checkend', '86400', '-noout')

der_path = public / '77-local-test-ca.cer'
run('x509', '-in', ca_cert, '-outform', 'DER', '-out', der_path)
der = der_path.read_bytes()
fingerprint = hashlib.sha256(der).hexdigest().upper()
identifier = 'local.qiqi.https.' + fingerprint[:16].lower()
profile_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, identifier)).upper()
certificate_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, identifier + '.root')).upper()
profile = {
    'PayloadType': 'Configuration', 'PayloadVersion': 1,
    'PayloadIdentifier': identifier, 'PayloadUUID': profile_uuid,
    'PayloadDisplayName': '77 本地测试 HTTPS',
    'PayloadDescription': '为同一 Wi-Fi 下的 77 小小乐园本地 HTTPS 测试安装一个根证书。安装后需手动开启完全信任；测试结束可删除本描述文件。',
    'PayloadOrganization': '77 Local Preview', 'PayloadRemovalDisallowed': False,
    'ConsentText': {'default': 'This profile contains only the 77 Local Test CA certificate for local HTTPS testing. It does not enroll or manage this device.',
                    'zh-Hans': '本描述文件只包含 77 Local Test CA 测试证书，不包含设备管理、VPN 或代理设置。测试结束可删除。'},
    'PayloadContent': [{
        'PayloadType': 'com.apple.security.root', 'PayloadVersion': 1,
        'PayloadIdentifier': identifier + '.root', 'PayloadUUID': certificate_uuid,
        'PayloadDisplayName': '77 Local Test CA',
        'PayloadCertificateFileName': der_path.name, 'PayloadContent': der,
    }],
}
(public / '77-local-https.mobileconfig').write_bytes(plistlib.dumps(profile))
config = {'lanAddress': str(address), 'httpsPort': 4443, 'setupPort': 4180,
          'caName': '77 Local Test CA', 'caSha256': fingerprint,
          'certificateDates': run('x509', '-in', server_cert, '-noout', '-dates')}
config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

game_url = f'https://{address}:4443/'
page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>77 乐园 · iPad 本地测试安装</title>
<style>body{{font:17px/1.7 system-ui,sans-serif;color:#334d48;background:#fbf8f0;max-width:720px;margin:0 auto;padding:28px 22px}}h1{{font-size:26px;line-height:1.4}}li{{margin:18px 0}}a{{color:#24634e}}.button{{display:inline-block;padding:12px 18px;background:#397d67;color:white;border-radius:12px;text-decoration:none;margin:4px 0}}small{{font-size:13px;overflow-wrap:anywhere}}code{{font-size:15px}}.note{{padding:16px;background:#eaf1e6;border-radius:12px}}</style>
<h1>在 iPad 上测试本地乐园</h1><p>iPad 和 Mac 连接同一个 Wi-Fi，Mac 保持开机、不休眠。本次不发布到外网。</p>
<ol><li><strong>下载测试证书</strong><br><a class="button" href="/77-local-https.mobileconfig">下载 77 本地测试证书</a><br>Safari 提示下载描述文件时点“允许”。</li>
<li><strong>安装描述文件</strong><br>打开 iPad“设置”→“已下载描述文件”→“77 本地测试 HTTPS”→“安装”。如找不到入口，在“通用”→“VPN 与设备管理”中查看。按提示输入 iPad 的锁屏密码。这个自建描述文件可能显示“未签名”；内容只有一个测试证书。</li>
<li><strong>开启证书信任</strong><br>“设置”→“通用”→“关于本机”→“证书信任设置”，打开 <strong>77 Local Test CA</strong> 的完全信任。</li>
<li><strong>打开本地 HTTPS 乐园</strong><br><a class="button" href="{game_url}">打开本地测试版</a><br><a href="{game_url}">{game_url}</a><br>用 Safari 普通标签页打开，等待页面显示“图片和声音已保存到本机”。</li>
<li><strong>测试断网</strong><br>关闭 iPad 的 Wi-Fi 和蜂窝数据（如有），回到同一个 Safari 标签页刷新，再点图片和声音试试。测试后恢复网络即可。</li></ol>
<p class="note">这是独立测试地址，进度不会自动继承线上网站的存档。不要清除原网站的数据。先在 Safari 内测试；如果之后添加到主屏幕，请从图标打开后再确认下载完成。</p>
<p>测试结束可在“设置”→“通用”→“VPN 与设备管理”中删除“77 本地测试 HTTPS”。</p>
<p><a href="https://support.apple.com/zh-cn/102390">Apple：手动信任证书的说明</a></p>
<small>证书名称：77 Local Test CA<br>SHA-256：{html.escape(fingerprint)}<br>安装包只有公开证书；私钥保留在 Mac 的本地目录中。</small>
</html>'''
(public / 'index.html').write_text(page)
print(json.dumps({'setupURL': f'http://{address}:4180/', 'gameURL': game_url,
                  'caName': config['caName'], 'caSha256': fingerprint,
                  'certificateDates': config['certificateDates']}, ensure_ascii=False, indent=2))
