import hashlib
import json
import unittest
from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory
from sync import build_config, config_loaded, sync

def revision(ips):
    return hashlib.sha256(json.dumps(ips,separators=(",", ":")).encode()).hexdigest()
class BlocksTest(unittest.TestCase):
    def test_ipv4_ipv6_and_frontend_only(self):
        ips=["1.2.3.4","2001:db8::1"]
        config=build_config(ips,revision(ips))
        routers=config['http']['routers']
        self.assertEqual(len(routers),2)
        for router in routers.values():
            self.assertIn('Host(`jobstash.xyz`)',router['rule'])
            self.assertNotIn('recruiters.rip',router['rule'])
            self.assertIn('ClientIP(`2001:db8::1`)',router['rule'])
        self.assertEqual(build_config([],revision([]))['http'].get('routers', {}),{})
    def test_invalid_and_changed_lists_rejected(self):
        for ips in [['example.com'],['1.2.3.4/24'],['1.2.3.4`) || Host(`any'],['fe80::1%eth0']]:
            with self.assertRaises(ValueError):build_config(ips,revision(ips))
        with self.assertRaises(ValueError):build_config(['1.2.3.4'],revision([]))
    def test_only_confirm_exact_loaded_rules(self):
        config=build_config(['1.2.3.4'],revision(['1.2.3.4']))
        self.assertFalse(config_loaded(config,[]))
        observed=[dict(r,name=n+'@file',status='enabled',middlewares=['jobstash-ip-block-reject@file']) for n,r in config['http']['routers'].items()]
        self.assertTrue(config_loaded(config,observed))
        observed[0]['status']='disabled'
        self.assertFalse(config_loaded(config,observed))
    def test_failure_preserves_last_file_and_does_not_ack(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/'rules.yaml';path.write_text('previous working rules')
            settings=Path(folder)/'settings.json';settings.write_text(json.dumps(dict(url='https://example.test/proxy',secret='test',file=str(path),statusUrl='http://localhost/api/http/routers')))
            snapshot=dict(ips=['1.2.3.4'],revision=revision(['1.2.3.4']))
            with patch.dict('os.environ',{'BLOCKLIST_SETTINGS':str(settings)}),patch('sync.request_json',side_effect=[snapshot,RuntimeError('proxy down')]) as request:
                with self.assertRaises(RuntimeError):sync()
                self.assertEqual(path.read_text(),'previous working rules')
                self.assertEqual(request.call_count,2)
            with patch.dict('os.environ',{'BLOCKLIST_SETTINGS':str(settings)}),patch('sync.request_json',side_effect=RuntimeError('API down')):
                with self.assertRaises(RuntimeError):sync()
                self.assertEqual(path.read_text(),'previous working rules')
if __name__=='__main__':unittest.main()
