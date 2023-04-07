module.exports = function(grunt) {

	grunt.loadNpmTasks("grunt-eslint");
	grunt.loadNpmTasks("grunt-contrib-qunit");
	grunt.loadNpmTasks("grunt-contrib-requirejs");
	grunt.loadNpmTasks("grunt-mkdir");
	grunt.loadNpmTasks("grunt-concat-define");
	grunt.loadNpmTasks("grunt-contrib-uglify");

	grunt.initConfig({

		pkg: grunt.file.readJSON("package.json"),
		eslint: {
			target: ["src/js/**", "test/js/**"]
		},
		qunit: {
			all: ["test/index.html"],
			options: {
				puppeteer: {
					executablePath: "google-chrome"
				}
			}
		},
		requirejs: {
			compile: {
				options: {
					baseUrl: "src",
					mainConfigFile: "src/main.js",
					name: "node_modules/almond/almond.js",
					include: ["main.js"],
					out: "src/main-production.js",
					optimize: "none"
				}
			}
		},
		mkdir: {
			all: {
				options: {
					create: ["target"]
				}
			}
		},
		"concat-define": {
			options: {
				externalDependencies: ["Datum"],
				sourceRootDirectory: "src/js/pieces",
				outputFile: "target/pieces.js"
			}
		},
		uglify: {
			my_target: {
				files: {
					"target/pieces.min.js": ["target/pieces.js"]
				}
			}
		}
	});

	grunt.registerTask("default", ["eslint", "qunit", "requirejs", "mkdir", "concat-define", "uglify"]);
};
