const asyncHandler = require('express-async-handler');
const User = require("../models/User.js");

/**
 * @description  Register New User
 * @route  /api/auth/register
 * @method  POST
 * @access public
 */

exports.registerUser = asyncHandler(async (req, res) => {
  const { userName, email, password, role } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({
      success: false,
      message: 'User already exists',
    });
  }

  const user = await User.create({
    userName,
    email,
    password,
    role,
  });

  if (user) {
    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      message: 'You registered successfully',
      _id: user._id,
      userName: user.userName,
      email: user.email,
      role: user.role,
      profilePhoto: user.profilePhoto,
      token,
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Invalid user data',
    });
  }
});



/**
 * @description  Login User
 * @route  /api/auth/login
 * @method  POST
 * @access public
 */

exports.loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.comparePassword(password))) {
    const token = user.generateAuthToken();

    res.status(200).json({
      success: true, 
      _id: user._id,
      userName: user.userName,
      email: user.email,
      role: user.role,
      profilePhoto: user.profilePhoto,
      token
    });
  } else {
    res.status(401).json({
      success: false, 
      message: 'Invalid email or password',
    });
  }
});







