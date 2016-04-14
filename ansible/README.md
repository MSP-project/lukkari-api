# Lukkari-api Ansible scripts


## Tips

List all active services
`$ sudo service --status-all`

Show active pm2 node instances
`$ pm2 list`

Show app logs
`$ pm2 logs`

List open ports and the process that owns them
```
$ sudo lsof -i
$ sudo netstat -lptu
$ sudo netstat -tulpn
```

### Create new role
`ansible-galaxy init <role-name>`
