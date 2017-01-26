# Hydra-hpp Video

There's a [video demo](https://youtu.be/p-UV4d2cUKU) showing the hpp game running across three machines on AWS.
Below is the machine configurations.

## Machine Setup

I used three AWS t2.nano instances with 512K RAM, built using the ubuntu-xenial-16.04 AMI.

Each machine has NodeJS 6.9.4 installed.

```shell
$ curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
$ sudo apt-get install -y nodejs
$ node --version
v6.9.4
```

A copy of the hydra-hpp code is pulled into each instance and installed.

```shell
$ git clone https://github.com/cjus/hydra-hpp.git
$ cd hydra-hpp
$ npm install
```
