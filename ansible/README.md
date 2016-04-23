# Lukkari-api Ansible scripts

## New release
```
$ ansible-playbook main-playbook.yml -i hosts -u lukkari --tags "new_release" --ask-become-pass
```

## Tips

List all active services  
```
$ sudo service --status-all
```

Show active pm2 node instances  
```
$ pm2 list
```

Show app logs  
```
$ pm2 logs
```

List open ports and the process that owns them
```
$ sudo lsof -i
$ sudo netstat -lptu
$ sudo netstat -tulpn
```

Kill the `/etc/init.d/selenium-standalone` process  
```
$ pkill selenium-standalone
```


### Encountered problems
**pm2**  
If we run the ansible scripts as root the pm2 processes wont be visible to user `lukkari`.
They reserve the port 8082 that we use => log in as `root` and run
```
pm2 delete all
```

**Ansible**  
When `become_user` is set to `lukkari` we need to set `/var/www` permissions  
```
$ sudo chown -R lukkari:lukkari /var/www
```

**Out of memory**  
Add swap => [How To Add Swap on Ubuntu 14.04](https://www.digitalocean.com/community/tutorials/how-to-add-swap-on-ubuntu-14-04)
