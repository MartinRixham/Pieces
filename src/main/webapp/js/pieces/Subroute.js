define(["./CompoundWord"], function(CompoundWord) {

	function Subroute(route) {

		var words = [];

		var index = 0;

		this.setUpdating = function() {

			route.setUpdating();
		};

		this.addRoute = function(word) {

			for (var i = 0; i < words.length; i++) {

				if (!words[i].hasIndex(index)) {

					words[i].push(word);

					return;
				}
			}

			var newIndex = words.length;
			var newWord = new CompoundWord(index);

			words[newIndex] = newWord;
			words[newIndex].push(word);

			return route.addRoute(newWord);
		};

		this.update = function(index) {

			route.update(index);
		};

		this.changePage = function(index) {

			route.changePage(index);
		};

		this.callHome = function(i) {

			index = i;
		};

		this.setIndex = function(index) {

			for (var i = 0; i < words.length; i++) {

				words[i].setIndex(index);
			}
		};
	}

	return Subroute;
});
