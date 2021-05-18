const yaml = require('js-yaml');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();


(async () => {
  try {
    var workspacename;
    var rolename;
    var workspaceConfig;
    var workspaceEndpoint = '/workspaces';
    var rbacEndpoint = '/rbac';
    var rolesEndpoint = '/roles';
    var permissionsEndpoint = '/endpoints';
    var adminEndpoint = '/admins';
    var pluginsEndpoint = '/plugins';
    let fileContents = fs.readFileSync('./config/workspaces.yaml', 'utf8');
    let workspacesinput = yaml.load(fileContents);
    var headers = {
      headers: {
        'Kong-Admin-Token': process.env.ADMIN_TOKEN,
        'validateStatus': false
      }
    };
    var kongaddr = 'http://localhost:8001'
    if (process.env.KONG_ADDR) {
      kongaddr = process.env.KONG_ADDR;
    }

    for (var workspace of workspacesinput.workspaces) {
      workspacename = workspace.name;
      workspaceConfig = workspace.config;
      var workspacedata = {
        'name': workspacename,
        'config': workspaceConfig
      }

      var res = '';
      try {
        res = await axios.get(kongaddr + workspaceEndpoint + '/' + workspacename, headers);
        if (res.status == 200) {
          res = await axios.patch(kongaddr + workspaceEndpoint + '/' + workspacename, workspacedata, headers);
          ({ res, rolename } = await handleRbac(res, kongaddr, headers, workspacename, workspace, rolename, rbacEndpoint, rolesEndpoint, adminEndpoint, pluginsEndpoint, permissionsEndpoint));
          res = await handlePlugins(workspace, res, kongaddr, workspacename, pluginsEndpoint, headers);
        }

      } catch (e) {
        if (e.response.status == 404) {
          res = await axios.post(kongaddr + workspaceEndpoint, workspacedata, headers);
          ({ res, rolename } = await handleRbac(res, kongaddr, headers, workspacename, workspace, rolename, rbacEndpoint, rolesEndpoint, adminEndpoint, pluginsEndpoint, permissionsEndpoint));
        } else {
          console.log(e.stack);
        }
      }
      console.log(workspacename + " created and config applied sucessfully");
    }
  } catch (e) {
    console.log(e.stack);
  }
})();

async function handleRbac(res, kongaddr, headers, workspacename, workspace, rolename, rbacEndpoint, rolesEndpoint, adminEndpoint, pluginsEndpoint, permissionsEndpoint) {

  res = await handlePlugins(workspace, res, kongaddr, workspacename, pluginsEndpoint, headers);
  var currentRoles = await axios.get(kongaddr + '/' + workspacename + rbacEndpoint + rolesEndpoint, headers);
  for (var oldRole of currentRoles.data.data) {
    res = await axios.delete(kongaddr + '/' + workspacename + rbacEndpoint + rolesEndpoint + '/' + oldRole.name, headers);
  }
  for (var rbac of workspace.rbac) {
    rolename = rbac.role;
    var roledata = {
      'name': rolename
    };
    try {
      res = await axios.get(kongaddr + '/' + workspacename + rbacEndpoint + rolesEndpoint + '/' + rolename, headers);
      var currentPermissions = await axios.get(kongaddr + '/' + workspacename + rbacEndpoint + rolesEndpoint + '/' + rolename + permissionsEndpoint, headers);
      for (var oldPermission of currentPermissions.data.data) {
        res = await axios.delete(kongaddr + '/' + workspacename + rbacEndpoint + rolesEndpoint + '/' + rolename + permissionsEndpoint + '/' + workspacename + '/' + oldPermission.endpoint, headers);
      }
      for (var permissions of rbac.permissions) {
        res = await axios.post(kongaddr + '/' + workspacename + rbacEndpoint + rolesEndpoint + '/' + rolename + permissionsEndpoint, permissions, headers);
        res = await handleUsers(rbac, res, kongaddr, workspacename, adminEndpoint, headers, rolename, rolesEndpoint);
      }
    } catch (e) {
      if (e.response.status == 404) {
        res = await axios.post(kongaddr + '/' + workspacename + rbacEndpoint + rolesEndpoint, roledata, headers);
        for (var permissions of rbac.permissions) {
          res = await axios.post(kongaddr + '/' + workspacename + rbacEndpoint + rolesEndpoint + '/' + rolename + permissionsEndpoint, permissions, headers);
        }
        res = await handleUsers(rbac, res, kongaddr, workspacename, adminEndpoint, headers, rolename, rolesEndpoint);
      } else {
        console.log(e.stack);
      }
    }
  }
  return { res, rolename };
}

async function handleUsers(rbac, res, kongaddr, workspacename, adminEndpoint, headers, rolename, rolesEndpoint) {
  for (var user of rbac.users) {
    try {
      var rolesData = {
        'roles': rolename
      };
      res = await axios.get(kongaddr + '/' + workspacename + adminEndpoint + '/' + user.username, headers);
      if (res.status == 200) {
        res = await axios.patch(kongaddr + '/' + workspacename + adminEndpoint + '/' + user.username, user, headers);
        var currentRoles = await axios.get(kongaddr + '/' + workspacename + adminEndpoint + '/' + user.username + rolesEndpoint, headers);
        for (var oldRole of currentRoles.data.roles) {
          res = await axios.get(kongaddr + '/' + workspacename + adminEndpoint + '/' + user.username + rolesEndpoint + '/' + oldRole.name, headers);
        }

        res = await axios.post(kongaddr + '/' + workspacename + adminEndpoint + '/' + user.username + rolesEndpoint, rolesData, headers);
      }
    } catch (e) {
      if (e.response.status == 404) {
        res = await axios.post(kongaddr + '/' + workspacename + adminEndpoint, user, headers);
        res = await axios.post(kongaddr + '/' + workspacename + adminEndpoint + '/' + user.username + rolesEndpoint, rolesData, headers);
      } else {
        console.log(e.stack);
      }
    }
  }
  return res;
}

async function handlePlugins(workspace, res, kongaddr, workspacename, pluginsEndpoint, headers) {
  try {
    var currentPlugins = await axios.get(kongaddr + '/' + workspacename + pluginsEndpoint, headers);
    for (var oldPlugin of currentPlugins.data.data) {
      if (oldPlugin.route == null && oldPlugin.service == null) {
        res = await axios.delete(kongaddr + '/' + workspacename + pluginsEndpoint + '/' + oldPlugin.id, headers);
      }
    }
    for (var plugin of workspace.plugins) {
      res = await axios.post(kongaddr + '/' + workspacename + pluginsEndpoint, plugin, headers);
    }
  } catch (e) {
    console.log(e.stack);
  }
  return res;
}

