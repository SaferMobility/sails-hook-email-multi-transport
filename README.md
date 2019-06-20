# sails-hook-email-multi-transport

Email hook for [Sails JS](http://sailsjs.org), using [Nodemailer](https://github.com/nodemailer/nodemailer), which allows for multiple Nodemailer [transports](https://nodemailer.com/usage/) for sending different types of email though different ways.

*Note: This requires Sails v0.10.6+.*

### Installation

`npm install sails-hook-email-multi-transport`

### Usage

`sails.hooks.email.send(template, data, options, cb)`

Parameter      | Type                | Details
-------------- | ------------------- |:---------------------------------
template       | ((string))          | Relative path from `templateDir` (see "Configuration" below) to a folder containing email templates.
data           | ((object))          | Data to use to replace template tokens
options        | ((object))          | Email sending options (see [Nodemailer docs](https://nodemailer.com/))
cb             | ((function))        | Callback to be run after the email sends (or if an error occurs).

### Configuration

By default, configuration lives in `sails.config.email`.  The configuration key (`email`) can be changed by setting `sails.config.hooks['sails-hook-email-multi-transport'].configKey`. The configuration is a single configuration object or an array of objects that look like this:

Parameter      | Type                | Details
-------------- | ------------------- |:---------------------------------
transporters   | ((array)) | An array of `transporter` objects (described below)
templateDir | ((string)) | Path to view templates relative to `sails.config.appPath` (defaults to `views/emailTemplates`)
from | ((string)) | Default `from` email address
alwaysSendTo | ((string)) | If set, all emails will be sent to this address regardless of the `to` option specified.  Good for testing live emails without worrying about accidentally spamming people.
testMode | ((boolean)) | Flag indicating whether the hook is in "test mode" globally for all transports.  In test mode, email options and contents are written to a `.tmp/email-TRANSPORT.txt` file instead of being actually sent.  Defaults to `true`.

#### Transporter Object definition

Parameter      | Type                | Details
-------------- | ------------------- |:---------------------------------
name           | ((string)) | The name of this transporter to reference it later
isDefault      | ((boolean)) | Whether to use this transporter as the default if a transporter is not specified when sending the mail message. *Note that if more than one transporter has this option set to `true`, there is no guarantee of which one will be used.*
service        | ((string)) | A "well-known service" that Nodemailer knows how to communicate with (see [this list of services](https://github.com/andris9/nodemailer-wellknown/blob/v0.1.5/README.md#supported-services))
auth | ((object)) | Authentication object as `{user:"...", pass:"..."}`
transporter | ((object)) | Custom transporter passed directly to nodemailer.createTransport (overrides service/auth) (see [Other Transports](https://nodemailer.com/transports/))
testMode | ((boolean)) | Flag indicating whether the hook is in "test mode".  In test mode, email options and contents are written to a `.tmp/email-TRANSPORT.txt` file instead of being actually sent.  Defaults to `true`.

#### Example

```javascript
// [your-sails-app]/config/email.js
module.exports.email = {
  transporters: [
    {
      name: 'MyGmail',
      isDefault: true,
      service: 'Gmail',
      auth: {user: 'foobar@gmail.com', pass: 'emailpassword'},
      testMode: true
    }
  ]
};

```


### Templates

Templates are generated using your configured Sails [View Engine](http://sailsjs.org/#!/documentation/concepts/Views/ViewEngines.html), allowing for multiple template engines and layouts.  If Sails Views are disabled, will fallback to EJS templates. To define a new email template, create a new folder with the template name inside your `templateDir` directory, and add an **html.ejs** file inside the folder (substituting .ejs for your template engine).  You may also add an optional `text.ejs` file; if none is provided, Nodemailer will attempt to create a text version of the email based on the html version.

### Example

Given the following **html.ejs** file contained in the folder **views/emailTemplates/testEmail**:

```
<p>Dear <%=recipientName%>,</p>
<br/>
<p><em>Thank you</em> for being a friend.</p>
<p>Love,<br/><%=senderName%></p>
```

executing the following command (after [configuring for your email service](https://github.com/balderdashy/sails-hook-email/#configuration) and turning off test mode) :

```
sails.hooks.email.send(
  "testEmail",
  {
    recipientName: "Joe",
    senderName: "Sue"
  },
  {
    to: "joe@example.com",
    subject: "Hi there",
    transport: "MyGmail"
  },
  function(err) {console.log(err || "It worked!");}
)
```

will result in the following email being sent to `joe@example.com`

> Dear Joe,
>
> *Thank you* for being a friend.
>
> Love,
>
> Sue

with an error being printed to the console if one occurred, otherwise "It worked!".
